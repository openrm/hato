const Plugin = require('./base');
const { Scopes: { CONNECTION } } = require('../lib/constants');

const createBackoff = ({
    min = 1 * 1e3,
    max = 10 * 1e3,
    base = 2
}) => (c) => Math.min(max, Math.pow(base, c) * min);

module.exports = class extends Plugin {

    constructor(options = {}) {
        super('conn-retry');

        this.options = options;
        this.timeouts = [];
    }

    init() {
        const { retries = 5 } = this.options;
        const backoff = createBackoff(this.options);

        this.scopes[CONNECTION] = this.retry(retries, backoff);
    }

    retry(retries, backoff) {
        return (connect) => {
            const retryable = (c, ...args) => {
                if (0 < c) this.logger.debug(
                    '[AMQP:conn-retry] Retrying to connect...');

                let timer = null;
                let cancel = false;

                const close = () => {
                    clearTimeout(timer);
                    cancel = true;
                };

                process.once('SIGINT', close);
                process.once('SIGTERM', close);

                return connect(...args)
                    .catch((err) => {
                        if (c + 1 >= retries) throw err;

                        const wait = backoff(c);
                        this.logger.warn(
                            `[AMQP:conn-retry] Connection failed. Retrying in ${wait}ms...`,
                            err.message);

                        return new Promise((resolve, reject) => {
                            if (cancel) return resolve();

                            timer = setTimeout(() =>
                                retryable(c + 1, ...args).then(resolve)
                                    .catch(reject), wait);

                            this.timeouts.push(timer);
                        }).then((r) => {
                            process.removeListener('SIGINT', close);
                            process.removeListener('SIGTERM', close);

                            return r;
                        });
                    });
            };

            return retryable.bind(null, 0);
        };
    }

    destroy() {
        this.timeouts.forEach((timer) => clearTimeout(timer));
    }

};
