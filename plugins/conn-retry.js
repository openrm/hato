const Plugin = require('./base');
const { Scopes: { CONNECTION } } = require('../lib/constants');

// Exponential backoff capped at `max`. `jitter` (0 to 1) takes that share of the wait away at random, so that
// the replicas of a service that lost the broker together do not all come back on the same second.
const createBackoff = ({
    min = 1 * 1e3,
    max = 10 * 1e3,
    base = 2,
    jitter = 0.5
}) => (c) => {
    const wait = Math.min(max, Math.pow(base, c) * min);
    return Math.round(wait * (1 - jitter * Math.random()));
};

// 30 attempts with the default backoff wait about 4.5 minutes in total, longer than a broker pod needs to move to
// another node (image pull, volume attach, a pending pod waiting for room) and shorter than a service's probes
// would tolerate if it were stuck for good.
const DEFAULT_RETRIES = 30;

module.exports = class extends Plugin {

    constructor(options = {}) {
        super('conn-retry');

        this.options = options;
        this.timeouts = [];

        this.termSignals = ['SIGINT', 'SIGTERM'];
    }

    init() {
        const { retries = DEFAULT_RETRIES, shuffle = true } = this.options;
        const backoff = createBackoff(this.options);

        this.scopes[CONNECTION] = this.retry(retries, backoff, shuffle);

        this.stop = false;
    }

    retry(retries, backoff, shuffle = true) {
        return (connect) => {
            const retryable = (c, offset, ...args) => {
                if (0 < c) this.logger.debug(
                    '[AMQP:conn-retry] Retrying to connect...');

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
                        });
                    });
            };

            return (...args) => {
                const [url] = args;
                const offset = shuffle && Array.isArray(url) && url.length
                    ? Math.floor(Math.random() * url.length) : 0;

                // One listener per signal for the whole connect, not one per attempt: with dozens of attempts
                // they would pile up (MaxListenersExceededWarning) and outlive the connection.
                const destroy = this.destroy.bind(this);
                this.termSignals.forEach((sig) => process.once(sig, destroy));
                const done = () => this.termSignals.forEach((sig) => process.off(sig, destroy));

                return retryable(0, offset, ...args).then(
                    (conn) => { done(); return conn; },
                    (err) => { done(); throw err; });
            };
        };
    }

    destroy() {
        this.timeouts.forEach((timer) => clearTimeout(timer));
        this.stop = true;
    }

};
