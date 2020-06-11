const Plugin = require('../base');
const { promise } = require('../helpers');
const { Scopes: { API, CHANNEL } } = require('../../lib/constants');

const backoff = require('./backoff');
const context = require('./context');
const configs = require('./configs');
const errors = require('./errors');

const { RetryError } = errors;

/**
 * @typedef {import('../../lib/api')} ContextChannel
 */

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

/** @this {ContextChannel} */
function retry(msg, count, delay = 500) {
    const { fields: { exchange, routingKey } } = msg;
    const { name: delayExchange } = configs.exchange();
    const inject = context.inject(delay, exchange);
    const options = {
        ...msg.properties,
        headers: inject({
            ...msg.properties.headers,
            'x-retry-count': count
        })
    };
    return this._asserted()
        .then(assertDelayQueue(delay, exchange))
        .then(() => {
            return this
                .exchange(delayExchange)
                .publish(routingKey, msg.content, options)
                .then(msg.ack);
        });
}

module.exports = class extends Plugin {

    constructor({ retries = 5, ...options } = {}) {
        super();

        this.options = { retries, ...options };

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

            consume(queue, fn, {
                retries = globalOptions.retries,
                retry: localOptions = {},
                ...options
            } = {}) {
                retries = retries >= 0 ? retries : globalOptions.retries;

                const computeDelay = backoff({ ...globalOptions, ...localOptions });

                const handler = (msg) => {
                    const count = context.count(msg.properties.headers);

                    const retryable = (err) =>
                        count < retries && errors.isRetryable(err) && !RetryError.is(msg);

                    return promise
                        .wrap(() => fn(msg))
                        .catch((err) => {
                            retryable(err) ?
                                retry.call(this, msg, count + 1, computeDelay(count)) :
                                msg.nack(false, false, new RetryError(err, msg));
                            return err instanceof Error ?
                                err : new Error(err.toString());
                        });
                };

                return super.consume(queue, handler, options);
            }

        };
    }

};
