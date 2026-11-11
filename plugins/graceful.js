const { constants: { signals: SIGNALS } } = require('os');

const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const DEFAULT_DRAIN_TIMEOUT = 30000;
const DEFAULT_SIGNALS = ['SIGINT', 'SIGTERM'];

// What `signals` stands for: true is the default list, false (or an empty list) none, a list is used as given
function resolveSignals(signals) {
    if (signals === true) return DEFAULT_SIGNALS;
    if (!signals) return [];

    if (!Array.isArray(signals)) {
        throw new TypeError('GracefulShutdown: signals must be a boolean or a list of signal names');
    }

    for (const name of signals) {
        // SIGKILL and SIGSTOP cannot be handled, and node refuses to listen for them
        if (!(name in SIGNALS) || name === 'SIGKILL' || name === 'SIGSTOP') {
            throw new TypeError(`GracefulShutdown: cannot handle the signal ${name}`);
        }
    }

    return [...new Set(signals)];
}


/**
 * Closes the connection when the process is told to stop (SIGINT, SIGTERM), after the messages being
 * processed are done.
 *
 * The consumers are cancelled first, so that no new message is taken, the messages being processed are
 * waited for (at most `timeout` ms, 30000 by default), and only then is the connection closed. A message
 * that is still in progress at the timeout is never acknowledged: the broker redelivers it.
 *
 * `drain: false` closes the connection at once instead, as this plugin used to: a message that is being
 * processed loses its channel, and whatever the handler still does with it (acknowledge, publish, call
 * another service) fails. `drain: { timeout }` sets the time to wait.
 *
 * `signals` is the list of the signals to handle, `['SIGINT', 'SIGTERM']` by default (`true`). `false` or `[]`
 * leaves them to the application, which then calls `stopConsuming()` and `drain()` itself, and closes the
 * client when it is ready (it may have other things to stop first).
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

        const { drain = true, signals = true } = options ?? {};

        this.options = {
            signals: resolveSignals(signals),
            drain: drain && {
                timeout: DEFAULT_DRAIN_TIMEOUT,
                ...(drain === true ? {} : drain)
            }
        };

        this._subscriptions = new Set();
        this._channels = new Set();
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
            .then(() => this._closeChannels())
            .then(closeConnection);
    }

    // A message acknowledged just before the connection is closed is not acknowledged at all: the broker
    // requeues it, and it is processed again. Closing the channels first waits for the broker to have taken
    // the acknowledgements, as Client.close() does.
    _closeChannels() {
        const channels = [...this._channels];
        this._channels.clear();

        return Promise.all(channels.map((ch) => ch.close()
            .catch((err) => this.logger.debug(
                `[AMQP:graceful] Could not close a channel: ${err && err.message}`))));
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

        if (!this.options.signals.length) return conn;

        this.options.signals.forEach((sig) => process.once(sig, close));

        conn.on('close', () => {
            this.options.signals.forEach((sig) => process.removeListener(sig, close));
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

    _onChannel(ch) {
        this._channels.add(ch);
        ch.on('close', () => this._channels.delete(ch));
        return ch;
    }

    init() {
        this.scopes[Scopes.CHANNEL] = (create) => () => create().then((ch) => this._onChannel(ch));

        this.scopes[Scopes.CONNECTION] = (connect) =>
            (url, socketOptions) => connect(url, socketOptions)
                .then((conn) => this._onConnection(conn));

        this.scopes[Scopes.API] = (constructor) => this._api(constructor);
    }

};
