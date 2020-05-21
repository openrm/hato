const Plugin = require('./base');
const { Scopes: { CONNECTION } } = require('../lib/constants');

const createBackoff = ({
    min = 1 * 1e3,
    max = 10 * 1e3,
    base = 2
}) => (c) => Math.min(max, Math.pow(base, c) * min);

module.exports = class extends Plugin {

    constructor(options = {}) {
        super();

        this.options = options;
        this.timeouts = [];

        const attempt = ({ logger }) => {
            const { retries = 5 } = this.options;
            const backoff = createBackoff(this.options);

            return this.retry({ retries, backoff, logger });
        };

        this.wrappers = {
            [CONNECTION]: attempt
        };
    }

    retry({ retries, backoff, logger }) {
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
                            const timer = setTimeout(() =>
                                retryable(c + 1, ...args).then(resolve).catch(reject), wait);
                            this.timeouts.push(timer);
                        });
                    });
            };

            return retryable.bind(null, 0);
        };
    }

    destroy() {
        this.timeouts.forEach(timer => clearTimeout(timer));
    }

};
