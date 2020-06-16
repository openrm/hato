//
// Imports
//

const ContextChannel = require('./api');
const { connect } = require('./client');
const { Scopes } = require('./constants');
const { tap, fail, forward } = require('./utils');


//
// Types
//

/**
 * @typedef {import('./client').Connection} Connection
 * @typedef {import('./client').Channel & import('./client').ConfirmChannel} Channel
 * @typedef {import('./api').Context} Context
 * @typedef {import('./api').ChannelProperties} ChannelProperties
 * @typedef {import('./types').Logger} Logger
 */

/**
 * @typedef {{ plugins?: Plugin[], logger?: Logger, [key: string]: any }} Options
 */

/**
 * Workaround for JSDoc enums not being compiled as TS enums.
 *
 * @typedef {{
 *   ['connection']: () => (...args: import('./client').ConnectParams) => Promise<Connection>,
 *   ['channel']: (conn: Connection) => (...args: import('./client').CreateChannelParams) => Promise<Channel>,
 *   ['publication']: (ch: Channel) => (...args: import('./client').PublishParams) => ReturnType<Channel['publish']>,
 *   ['subscription']: (ch: Channel) => (...args: import('./client').SubscribeParams) => ReturnType<Channel['consume']>,
 *   ['api']: () => typeof ContextChannel
 * }} Factories
 */

/**
 * @typedef {any} Plugin
 */

/**
 * @typedef {Omit<ChannelProperties, '_self'> & {
 *   factories: Factories,
 *   ready: (ch: Channel) => void,
 *   aborted: Promise<Error>,
 *   _onClose: () => void,
 *   _connOpts: {
 *     url?: string | object,
 *     options?: Options
 *   }
 * }} ClientProperties
 *
 * @typedef {[Context | null, ChannelProperties]} ContextConstructorParameters
 */


//
// Utilities
//

const noop = () => {};

/**
 * Create an observable subject.
 *
 * @template T
 * @return {{ subscribe: Promise<T>, broadcast: (topic: T) => void }}
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
     *
     * @type {<T, U>(fn: (tail: Promise<T>) => Promise<U>) => Promise<U>}
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
 *
 * @template T
 * @param {T} original
 * @param {Scopes} scope
 * @param {Plugin[]} plugins
 * @return {T}
 */
function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => Object.keys(plugin.scopes).includes(scope))
        .reduce((next, plugin) => plugin.install(scope)(next), original);
}


//
// Client endpoint
//

/**
 * @param {typeof ContextChannel} apiClass
 */
function getClientClass(apiClass) {
    /**
     * Internal class.
     *
     * @class
     */
    class Client extends apiClass {

        /**
         * @constructor
         * @param {ClientProperties} properties
         */
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

            /** @readonly */
            this._connOpts = _connOpts;
            /** @readonly */
            this.ready = ready;
            /** @readonly */
            this.aborted = aborted;
            /** @readonly */
            this.factories = factories;
            /** @readonly */
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

            this.createChannel = () =>
                /** @type {Promise<Connection>} */ (this.conn)
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
            return this.conn && this.conn
                .then((conn) => conn.close())
                .catch((err) => {
                    this.logger.warn('[AMQP] An error occurred when closing a connection', err.message);
                });
        }

    }

    return Client;
}

/**
 * Apply plugins to factories of core method/classes.
 *
 * @param {Logger} logger
 * @param {Plugin[]} plugins
 * @return {Factories}
 * */
const installPlugins = (logger, plugins) => ({
    [Scopes.CONNECTION]: () => stack(
        connect.bind({ logger }), Scopes.CONNECTION, plugins),
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
 *
 * @typedef {(url?: string | object, options?: Options) => IClient} ClientConstructor
 * @typedef {{
 *   start: (url?: string | object, options?: Options) => Promise<IClient>,
 *   close: () => void
 * }} IClient
 *
 * @type {ClientConstructor & Pick<IClient, 'start'>}
 */
const Client = function(url, { logger = console, plugins = [], ...opts } = {}) {
    plugins.forEach((plugin) => plugin.enable(logger));

    const factories = installPlugins(logger, plugins);

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

/**
 * @memberof ClientConstructor
 */
Client.start = (url, options) => Client(url, options).start();


//
// Exports
//

module.exports = Client;
