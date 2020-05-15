const Plugin = require('./base');
const { Scopes: { CONNECTION } } = require('../lib/constants');

const createBackoff = ({
    min = 1 * 1e3,
    max = 10 * 1e3,
    base = 2
}) => (c) => Math.min(max, Math.pow(base, c) * min);

const retry = ({ retries, backoff, logger, cancelled }) => {
    return (connect) => {
        const retryable = (c, ...args) => {
            if (0 < c) logger.debug('[AMQP:conn-retry] Retrying to connect...');

            return connect(...args)
                .catch((err) => {
                    if (c + 1 >= retries) throw err;

                    const wait = backoff(c);
                    logger.warn(
                        `[AMQP:conn-retry] Connection failed. Retrying in ${wait}ms...`,
                        err.message);

                    return new Promise((resolve, reject) => {
                        const id = setTimeout(() =>
                            retryable(c + 1, ...args).then(resolve).catch(reject), wait);

                        cancelled.then(() => clearTimeout(id));
                    });
                });
        };

        return retryable.bind(null, 0);
    };
};

module.exports = class extends Plugin {

    constructor(options = {}) {
        super();
        this.options = options;
        this.wrappers = {
            [CONNECTION]: this.attemptConnection.bind(this)
        };
    }

    attemptConnection({ logger, cancelled }) {
        cancelled.then((reason) => {
            logger.warn(
                '[AMQP:conn-retry] Retries will be cancelled. Reason:',
                reason && reason.message);
        });

        const { retries = 5 } = this.options;
        const backoff = createBackoff(this.options);

        return retry({ retries, backoff, logger, cancelled });
    }

};
