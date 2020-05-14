const Plugin = require('./base');
const { Scopes: { API, CHANNEL } } = require('../lib/constants');

const associateDlx = (ch, name) => {
    const _assert = ch.assertQueue;
    ch.assertQueue = function(queue, options) {
        options = { deadLetterExchange: name, ...options };
        return _assert.call(ch, queue, options);
    };
    return ch;
};

module.exports = class extends Plugin {

    constructor({ name = 'dlx', type = 'topic', options = {} } = {}) {
        options = {
            durable: true,
            ...options
        };
        super();
        this.wrappers = {
            [CHANNEL]({ logger }) {
                return (create) => () => create()
                    .then((ch) => {
                        return ch
                            .assertExchange(name, type, options)
                            .then(() => associateDlx(ch, name))
                            .catch((err) => {
                                logger.error('[AMQP:dlx] Initial assertions failed:', err);
                                return ch;
                            });
                    });
            }
        };
    }

};
