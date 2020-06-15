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
/**
 * @template T
 * @typedef {{ new(...args: any): T }} ConstructorOf
 */

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
        .then(() => this
            .exchange(delayExchange)
            .publish(routingKey, msg.content, options)
            .then(msg.ack));
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

    /** @return {(original: ConstructorOf<ContextChannel>) => ConstructorOf<ContextChannel>} */
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
