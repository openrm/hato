const Plugin = require('../base');
const { Scopes: { API, CHANNEL } } = require('../../lib/constants');

const backoff = require('./backoff');
const context = require('./context');
const configs = require('./configs');
const errors = require('./errors');

const { symbolRetried, RetryError } = errors;

function assertDelayQueue(delay, exchange) {
    const { name, options } = configs.queue({ delay, exchange });
    const { name: ex } = configs.exchange();
    return (ch) => ch
        .assertQueue(name, options)
        .then(({ queue }) => ch
            .bindQueue(queue, ex, '', context.inject(delay, exchange)({
                'x-match': 'all'
            })));
}

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
        .then(() => this
            .exchange(delayExchange)
            .publish(routingKey, msg.content, options));
}

function nacked(msg) {
    const state = msg[Symbol.for('hato.ack.state')];
    if (!state) return false;
    else return state[0];
}

function retryOnError(fn, retries, computeDelay) {
    return (msg) => {
        const count = context.count(msg.properties.headers);

        return Promise.resolve()
            .then(() => fn(msg))
            .catch((err) => {
                const retryable =
                    count < retries &&
                    errors.isRetryable(err) &&
                    !nacked(msg);

                if (retryable) {
                    return retry
                        .call(this, msg, count + 1, computeDelay(count))
                        .then(() => {
                            msg.ack();
                            err[symbolRetried] = true;
                            throw err;
                        });
                } else {
                    msg.nack(false, false);

                    // prevent retyring in subsequent calls
                    throw new RetryError(err, msg);
                }
            });
    };
}

module.exports = class extends Plugin {

    constructor({ retries = 5, ...options } = {}) {
        super('retry');

        this.options = { retries, ...options };
    }

    init() {
        this.scopes[CHANNEL] = (create) => () =>
            create()
                .then((ch) => {
                    const { name, type, options } =
                        configs.exchange();
                    return ch.assertExchange(name, type, options)
                        .then(() => ch);
                });

        this.scopes[API] = this.handlePubsub();
    }

    handlePubsub() {
        const plugin = this;

        return (constructor) => class extends constructor {

            consume(queue, fn, {
                retries = plugin.options.retries,
                retry: localOptions = {},
                ...options
            } = {}) {
                retries = retries >= 0 ? retries : plugin.options.retries;

                const computeDelay = backoff({ ...plugin.options, ...localOptions });

                const handler = retryOnError.call(this, fn, retries, computeDelay);
                return super.consume(queue, handler, options);
            }

        };
    }

};
