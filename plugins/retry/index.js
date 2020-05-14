const Plugin = require('../base');
const { promise } = require('../helpers');
const { Scopes: { API, CHANNEL } } = require('../../lib/constants');

const backoff = require('./backoff');
const context = require('./context');
const configs = require('./configs');

function assertDelayQueue(delay, exchange) {
    const { name, options } = configs.queue({ delay, exchange });
    const { name: ex } = configs.exchange();
    return (ch) => {
        return ch
            .assertQueue(name, options)
            .then(({ queue }) => ch
                .bindQueue(queue, ex, '', context.inject(delay, exchange)({
                    'x-match': 'all'
                })));
    };
}

function retry(msg, delay = 500) {
    const { fields: { exchange, routingKey } } = msg;
    const { name: delayExchange } = configs.exchange();
    const options = {
        ...msg.properties,
        headers: context.inject(delay, exchange)(msg.properties.headers)
    };
    return this._asserted()
        .then(assertDelayQueue(delay, exchange))
        .then(() => {
            return this
                .exchange(delayExchange)
                .publish(routingKey, msg.content, options)
                .then(msg.ack);
            // TODO(naggingant) last ack fails on queues with no-ack set true
        });
}

module.exports = class extends Plugin {

    constructor(options = {}) {
        super();

        this.options = options;

        this.wrappers = {
            [CHANNEL]() {
                return (create) => () =>
                    create()
                        .then((ch) => {
                            const { name, type, options } =
                                configs.exchange();
                            return ch.assertExchange(name, type, options)
                                .then(() => ch);
                        });
            },
            [API]: () => this.handlePubsub.bind(this)
        };
    }

    handlePubsub(constructor) {
        const globalOptions = this.options;
        return class extends constructor {
            consume(queue, fn, { retries, retry: localOptions, ...options } = {}) {
                retries = retries >= 0 ? retries : globalOptions.retries;

                const computeDelay = backoff({ ...globalOptions, ...localOptions });

                const handler = (msg) => {
                    const count = context.count(msg.properties.headers);
                    const delay = computeDelay(count);
                    const fallback = count >= retries ?
                        msg.nack.bind(msg, false, false) :
                        retry.bind(this, msg, delay);
                    return promise
                        .wrap(() => fn(msg))
                        .catch((err) => {
                            fallback(err);
                            return err instanceof Error ? err : new Error(err);
                        });
                };

                return super.consume(queue, handler, options);
            }
        };
    }

};
