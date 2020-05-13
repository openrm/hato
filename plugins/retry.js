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
            expires: 24 * 60 * 60 * 1e3,
            messageTtl: delay
        }
    })
};

function retryCount({ properties: { headers } }) {
    const deaths = headers['x-death'] || [];
    const { name } = defaults.exchange();
    return deaths
        .filter(({ exchange, reason }) =>
            exchange === name && reason === 'expired')
        .reduce((c, { count }) => c + count, 0);
}

function retry(msg, delay = 500) {
    const { fields: { exchange, routingKey } } = msg;
    const { name: ex } = defaults.exchange();
    return this._asserted()
        .then((ch) => {
            const { name, options } =
                defaults.queue({ delay, exchange });
            return ch
                .assertQueue(name, options)
                .then(({ queue }) => ch
                    .bindQueue(queue, ex, '', {
                        'x-match': 'all',
                        delay
                    }));
        })
        .then(() => {
            const options = {
                ...msg.properties,
                headers: {
                    ...msg.properties.headers,
                    delay
                }
            };
            return this
                .exchange(ex)
                .publish(routingKey, msg.content, options);
        });
}

module.exports = class extends Plugin {

    constructor({ retries = 5, min = 500 } = {}) {
        super();
        this.wrappers = {
            [CHANNEL]() {
                return (create) => () => {
                    let _ch;
                    return create()
                        .then((ch) => _ch = ch)
                        .then((ch) => {
                            const { name, type, options } =
                                defaults.exchange();
                            return ch.assertExchange(name, type, options);
                        })
                        .then(() => _ch);
                };
            },
            [API]() {
                return (constructor) => class extends constructor {
                    consume(queue, fn, options) {
                        const handler = (msg) => {
                            const count = retryCount(msg);
                            const delay = (count + 1) * min;
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
    }

};
