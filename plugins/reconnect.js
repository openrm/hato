const { Scopes: { CONNECTION } } = require('../lib/constants');

module.exports = function(options = {}) {

    const {
        retries = 5,
        min = 1 * 1e3,
        max = 60 * 1e3,
        factor = 2
    } = options;

    this.wrappers = {
        [CONNECTION]: ({ logger }) => (connect) => {
            const retryable = (c, ...args) => {
                if (0 < c) logger.debug('[AMQP:reconnect] Reconnecting...');
                return connect(...args)
                    .catch((err) => {
                        if (c + 1 >= retries) throw err;

                        const wait = Math.pow(factor, c) * min;
                        logger.warn(`[AMQP:reconnect] Connection failed. Try reconnecting in ${wait}ms...`, err);

                        return new Promise((resolve, reject) => {
                            setTimeout(() => retryable(c + 1, ...args).then(resolve).catch(reject), wait);
                        });
                    });
            };

            const wrapped = (...args) => retryable(0, ...args);

            return wrapped;
        }
    }

    this.scopes = Object.keys(this.wrappers);
    this.wrap = (scope, context) => this.wrappers[scope](context).bind(this);

    return this;

};
