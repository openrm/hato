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

        this.termSignals = ['SIGINT', 'SIGTERM'];
    }

    init() {
        const { retries = 5, shuffle = true } = this.options;
        const backoff = createBackoff(this.options);

        this.scopes[CONNECTION] = this.retry(retries, backoff, shuffle);

        this.stop = false;
    }

    retry(retries, backoff, shuffle = true) {
        return (connect) => {
            const retryable = (c, offset, ...args) => {
                if (0 < c) this.logger.debug(
                    '[AMQP:conn-retry] Retrying to connect...');

                const destroy = this.destroy.bind(this);
                this.termSignals.forEach((sig) => process.once(sig, destroy));

                // an array of urls is rotated through, one per attempt,
                // starting from a per-connect offset
                const [url, ...rest] = args;
                const target = Array.isArray(url)
                    ? url[(offset + c) % url.length] : url;

                return connect(target, ...rest)
                    .catch((err) => {
                        if (c + 1 >= retries) throw err;

                        const wait = backoff(c);
                        this.logger.warn(
                            `[AMQP:conn-retry] Connection failed. Retrying in ${wait}ms...`,
                            err.message);

                        return new Promise((resolve, reject) => {
                            if (this.stop) return reject(new Error('Retries halted'));

                            const timer = setTimeout(() =>
                                retryable(c + 1, offset, ...args).then(resolve)
                                    .catch(reject), wait);

                            this.timeouts.push(timer);
                        }).then((conn) => {
                            this.termSignals.forEach((sig) => process.off(sig, destroy));
                            return conn;
                        });
                    });
            };

            return (...args) => {
                const [url] = args;
                const offset = shuffle && Array.isArray(url) && url.length
                    ? Math.floor(Math.random() * url.length) : 0;

                return retryable(0, offset, ...args);
            };
        };
    }

    destroy() {
        this.timeouts.forEach((timer) => clearTimeout(timer));
        this.stop = true;
    }

};
