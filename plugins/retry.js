const { Scopes: { CONNECTION } } = require('../lib/constants');

module.exports = function(options = {}) {

    const {
        retries = 5,
        min = 1 * 1e3,
        max = 10 * 1e3,
        factor = 2
    } = options;

    this.wrappers = {
        [CONNECTION]: ({ logger, cancelled }) => (connect) => {
            cancelled.then((reason) => {
                logger.warn('[AMQP:retry] Retries will be cancelled. Reason:', reason.message);
            });

            const retryable = (c, ...args) => {
                if (0 < c) logger.debug('[AMQP:retry] Retrying to connect...');
                return connect(...args)
                    .catch((err) => {
                        if (c + 1 >= retries) throw err;

                        const wait = Math.min(max, Math.pow(factor, c) * min);
                        logger.warn(`[AMQP:retry] Connection failed. Retrying in ${wait}ms...`, err.message);

                        return new Promise((resolve, reject) => {
                            const id = setTimeout(() =>
                                retryable(c + 1, ...args).then(resolve).catch(reject), wait);

                            cancelled.then(() => clearTimeout(id));
                        });
                    });
            };

            return retryable.bind(null, 0);
        }
    }

    this.scopes = Object.keys(this.wrappers);
    this.wrap = (scope, context) => this.wrappers[scope](context).bind(this);

    return this;

};
