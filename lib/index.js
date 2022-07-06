//
// Imports
//

const ContextChannel = require('./api');
const { connect } = require('./client');
const { Scopes } = require('./constants');
const { tap, fail, forward } = require('./utils');


//
// Utilities
//

const noop = () => {};

/**
 * Create an observable subject.
 */
const createSubject = () => {
    let broadcast = () => {},
        subscribe = new Promise((resolve) => broadcast = resolve);
    return { broadcast, subscribe };
};

const createExtendable = () => {
    // observable to notify that the connection (and channels) are ready
    const { subscribe, broadcast } = createSubject();

    let asserted = subscribe;

    /**
     * Extend the promise chain by assertions
     * that are made before publishing.
     */
    const extend = (fn) => {
        const assert = fn(asserted);
        asserted = assert.then(() => subscribe);
        return assert;
    };

    return { extend, subscribe: () => asserted, broadcast };
};

/**
 * Create a factory funtion by wrapping the original with the plugins enabled.
 */
function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => Object.keys(plugin.scopes).includes(scope))
        .reduce((next, plugin) => plugin.install(scope)(next), original);
}


//
// Client endpoint
//

function getClientClass(apiClass) {
    /**
     * Internal class.
     */
    class Client extends apiClass {

        constructor({
            factories,
            ready,
            aborted,
            logger,
            abort,
            _assert,
            _asserted,
            _onClose = noop,
            _connOpts
        }) {
            super(null, {
                logger,
                abort,
                _assert,
                _asserted,
                _self: apiClass
            });

            this._connOpts = _connOpts;
            this.ready = ready;
            this.aborted = aborted;
            this.factories = factories;
            this._onClose = _onClose;
        }

        start() {
            const ready = this.ready, abort = this.abort;

            const { url = '', options } = this._connOpts;
            this.connect = this.factories.connection();

            // initiate connection to the broker
            this.conn = this.connect(url, options)
                .then((conn) => {
                    conn.on('close', this._onClose);
                    ['close', 'error'].forEach(forward(conn, this));
                    this.aborted.then(this.close.bind(this));
                    return conn;
                });

            this.createChannel = () => this.conn
                .then((conn) => this.factories.channel(conn)());

            // open channel(s) using the created connection
            this.ch = this.createChannel()
                .then((ch) => {
                    ch.on('close', this.close.bind(this));
                    ch.publish = this.factories.publication(ch);
                    ch.consume = this.factories.subscription(ch);
                    return ch;
                })
                .then(tap(ready)) // notify the ready status of the channel
                .catch(abort);

            // return a promise to be resolved after the assertions
            return Promise.race([
                this._asserted(),
                this.aborted.then(fail)
            ]).then(() => this);
        }

        close() {
            if (this._closing) return this._closing;
            return this._closing = this.ch && this.ch
                .then((ch) => ch && ch.close())
                .catch((err) => {
                    this.logger.warn(
                        '[AMQP] An error occurred when closing the channel:',
                        err.message);
                })
                .then(() => this.conn)
                .then((conn) => conn && conn.close())
                .catch((err) => {
                    this.logger.warn(
                        '[AMQP] An error occurred when closing the connection:',
                        err.message);
                });
        }

    }

    return Client;
}

/**
 * Register connection hooks from plugins
 */
const registerHooks = (plugins, connect) => function(url, socketOptions) {
    return connect(url, socketOptions)
        .then(tap((conn) => {
            plugins
                .filter((plugin) =>
                    Scopes.CONNECTION in (plugin.hooks || {}))
                .forEach((plugin) =>
                    plugin.hooks[Scopes.CONNECTION](conn));
        }));
};

/**
 * Apply plugins to factories of core method/classes.
 * */
const installPlugins = (plugins, connect) => ({
    [Scopes.CONNECTION]: () => stack(
        connect, Scopes.CONNECTION, plugins),
    [Scopes.CHANNEL]: (conn) => stack(
        conn.createConfirmChannel.bind(conn), Scopes.CHANNEL, plugins),
    [Scopes.PUBLICATION]: (ch) => stack(
        ch.publish.bind(ch), Scopes.PUBLICATION, plugins),
    [Scopes.SUBSCRIPTION]: (ch) => stack(
        ch.consume.bind(ch), Scopes.SUBSCRIPTION, plugins),
    [Scopes.API]: () => stack(
        ContextChannel, Scopes.API, plugins)
});

/**
 * Entry point for users. able to start the connection with.
 */
const Client = function(url, { logger = console, plugins = [], ...opts } = {}) {
    plugins.forEach((plugin) => plugin.enable(logger));

    const factories = installPlugins(plugins,
        registerHooks(plugins, connect.bind({ logger })));

    // observable to be fired when aborting all operations and tearing down
    const { subscribe: aborted, broadcast: abort } = createSubject();

    const { subscribe: _asserted, extend: _assert, broadcast: ready } = createExtendable();

    // extended API
    const api = factories.api();
    const Client = getClientClass(api);

    return new Client({
        ready,
        aborted,
        factories,
        logger,
        abort,
        _assert,
        _asserted,
        _onClose: () => plugins.forEach((plugin) =>
            typeof plugin.destroy === 'function' && plugin.destroy()),
        _connOpts: {
            url,
            options: opts
        }
    });
};

Client.start = (url, options) => Client(url, options).start();


//
// Exports
//

module.exports = Client;
