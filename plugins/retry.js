const Plugin = require('./base');
const { promise } = require('./helpers');
const { Scopes: { API, CHANNEL } } = require('../lib/constants');

const defaults = {
    exchange: () => ({
        name: 'delay',
        type: 'headers',
        options: { durable: true }
    }),
    queue: ({ delay = 500, exchange = '' } = {}) => ({
        name: `delay.${delay}.${exchange}`,
        options: {
            durable: true,
            deadLetterExchange: exchange,
            expires: 60 * 60 * 1e3,
            messageTtl: delay
        }
    })
};

const backoff = ({ initial }) => ({
    constant: () => initial,
    linear: (c) => initial * (c + 1),
    exponential: (c, { base = 2 } = {}) => initial * Math.pow(base, c)
});

const inject = (delay, exchange) => (headers) => ({
    ...headers,
    'retry-destination': exchange,
    'retry-delay': delay
});

function retryCount({ properties: { headers } }) {
    const deaths = headers['x-death'] || [];
    const { name } = defaults.exchange();
    return deaths
        .filter(({ exchange, reason }) =>
            exchange === name && reason === 'expired')
        .reduce((c, { count }) => c + count, 0);
}

function assertDelayQueue(delay, exchange) {
    const { name, options } = defaults.queue({ delay, exchange });
    const { name: ex } = defaults.exchange();
    return (ch) => {
        return ch
            .assertQueue(name, options)
            .then(({ queue }) => ch
                .bindQueue(queue, ex, '', inject(delay, exchange)({
                    'x-match': 'all'
                })));
    };
}

function retry(msg, delay = 500) {
    const { fields: { exchange, routingKey } } = msg;
    const { name: delayExchange } = defaults.exchange();
    return this._asserted()
        .then(assertDelayQueue(delay, exchange))
        .then(() => {
            const options = {
                ...msg.properties,
                headers: inject(delay, exchange)(msg.properties.headers)
            };
            return this
                .exchange(delayExchange)
                .publish(routingKey, msg.content, options);
        })
}

function createDelayFunc(options) {
    const {
        min = 500,
        max = Infinity,
        strategy = 'exponential',
        ...strategyOptions
    } = options;

    const _delayFn = backoff({ initial: min })[strategy];
    return (count) => {
        const d = _delayFn(count, strategyOptions);
        return Math.min(max, Math.floor(d));
    };
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
                                defaults.exchange();
                            return ch.assertExchange(name, type, options)
                                .then(() => ch);
                        });
            },
            [API]: () => this.handlePubsub.bind(this)
        };
    }

    handlePubsub(constructor) {
        const plugin = this;
        return class extends constructor {
            consume(queue, fn, { retries, retry: localOptions, ...options } = {}) {
                retries = retries >= 0 ? retries : plugin.options.retries;

                const delayFn = createDelayFunc({ ...plugin.options, ...localOptions });

                const handler = (msg) => {
                    const count = retryCount(msg);
                    const delay = delayFn(count);
                    const fallback = count >= retries ?
                        msg.nack.bind(null, false, false) :
                        retry.bind(this, msg, delay);
                    return promise
                        .wrap(fn.bind(null, msg))
                        .catch(fallback);
                };

                return super.consume(queue, handler, options);
            }
        };
    }

};
