const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const DEFAULT_DRAIN_TIMEOUT = 30000;

/**
 * Closes the connection when the process is told to stop (SIGINT, SIGTERM).
 *
 * By default the connection is closed at once: a message that is being processed loses its channel, and
 * whatever the handler still does with it (acknowledge, publish, call another service) fails.
 *
 * With `drain`, the consumers are cancelled first, so that no new message is taken, the messages being
 * processed are waited for (at most `timeout` ms, 30000 by default), and only then is the connection
 * closed. A message that is still in progress at the timeout is never acknowledged: the broker
 * redelivers it.
 *
 * Every handler of every subscription is tracked, whatever the plugins around it do (the whole handler
 * counts, including a retry being scheduled or an RPC reply being sent). `stopConsuming()` and `drain()`
 * are also available for an application that handles the signals itself.
 *
 * Subscriptions (`consume()`/`subscribe()`) are what `stopConsuming()` cancels: the reply queue of the
 * RPC plugin is not, since the messages in progress may still be waiting for an answer.
 */
module.exports = class GracefulShutdown extends Plugin {

    constructor(options) {
        super('graceful');

        const { drain = false } = options ?? {};

        this.options = {
            drain: drain && {
                timeout: DEFAULT_DRAIN_TIMEOUT,
                ...(drain === true ? {} : drain)
            }
        };

        this._subscriptions = new Set();
        this._waiters = [];
        this._inflight = 0;
    }

    /** The number of messages being processed */
    get inflight() {
        return this._inflight;
    }

    /**
     * Stops the delivery of new messages. Resolves once every consumer is cancelled (one that could not be,
     * e.g. on a closed channel, does not prevent the others).
     */
    stopConsuming() {
        const subscriptions = [...this._subscriptions];
        this._subscriptions.clear();

        return Promise.all(subscriptions.map((subscription) => Promise.resolve(subscription)
            .then((consumer) => consumer.cancel())
            .catch((err) => this.logger.debug(
                `[AMQP:graceful] Could not cancel a consumer: ${err && err.message}`))))
            .then(() => undefined);
    }

    /**
     * Resolves true once no message is being processed, false if `timeout` ms pass first.
     */
    drain(timeout = this.options.drain ? this.options.drain.timeout : DEFAULT_DRAIN_TIMEOUT) {
        if (!this._inflight) return Promise.resolve(true);

        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), timeout);
            this._waiters.push(() => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    _track(fn) {
        return (...args) => {
            this._inflight++;
            return Promise.resolve()
                .then(() => fn(...args))
                .finally(() => {
                    this._inflight--;
                    if (!this._inflight) this._waiters.splice(0).forEach((done) => done());
                });
        };
    }

    // Called on SIGINT and SIGTERM. Without `drain` the connection is closed at once.
    _shutdown(conn) {
        const closeConnection = () => conn.close()
            .catch((err) => this.logger.error(err));

        if (!this.options.drain) return closeConnection();

        return this.stopConsuming()
            .then(() => this.drain())
            .then((drained) => {
                if (!drained) {
                    this.logger.warn(
                        '[AMQP:graceful] Messages are still being processed ' +
                        `after ${this.options.drain.timeout}ms, closing anyway`);
                }
            })
            .then(closeConnection);
    }

    _onConnection(conn) {
        let closing = false;

        // Handle shutdown signals
        const close = (sig) => {
            if (closing) return;
            closing = true;
            this.logger.debug(`[AMQP:graceful] Received ${sig}, closing connection...`);
            return this._shutdown(conn);
        };

        process.once('SIGINT', close);
        process.once('SIGTERM', close);

        conn.on('close', () => {
            process.removeListener('SIGINT', close);
            process.removeListener('SIGTERM', close);
        });

        return conn;
    }

    _api(constructor) {
        const plugin = this;

        return class extends constructor {

            // Every handler goes through here once, wrapped by all the plugins: tracking it here counts the
            // whole handler, which a wrapper around the user's function (as the retry plugin's) would not.
            _consume(ch, queue, fn, ...rest) {
                return super._consume(ch, queue, plugin._track(fn), ...rest);
            }

            consume(...args) {
                const subscription = super.consume(...args);
                plugin._subscriptions.add(subscription);
                subscription.catch(() => plugin._subscriptions.delete(subscription));
                return subscription;
            }

        };
    }

    init() {
        this.scopes[Scopes.CONNECTION] = (connect) =>
            (url, socketOptions) => connect(url, socketOptions)
                .then((conn) => this._onConnection(conn));

        this.scopes[Scopes.API] = (constructor) => this._api(constructor);
    }

};
