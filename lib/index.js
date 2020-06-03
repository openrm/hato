//
// Imports
//

const ContextChannel = require('./api');
const { connect } = require('./client');
const { Scopes } = require('./constants');
const { tap } = require('./utils');


//
// Types
//

/**
 * @typedef { import("./client").Connection } Connection
 * @typedef { import("./client").Channel & import("./client").ConfirmChannel } Channel
 * @typedef { import("./api").Context } Context
 * @typedef { import("./api").ChannelProperties } ChannelProperties
 * @typedef { import("./types").Logger } Logger
 */

/**
 * @typedef {{ plugins?: Plugin[], logger?: Logger, [key: string]: any }} Options
 * @typedef {{ new(...args: ContextConstructorParameters): ContextChannel }} ApiConstructor
 */

/**
 * Workaround for JSDoc enums not being compiled as TS enums.
 *
 * @typedef {{
 *   ['connection']: () => (...args: import("./client").ConnectParams) => Promise<Connection>,
 *   ['channel']: (conn: Connection) => (...args: import("./client").CreateChannelParams) => Promise<Channel>,
 *   ['publication']: (ch: Channel) => (...args: import("./client").PublishParams) => ReturnType<Channel['publish']>,
 *   ['subscription']: (ch: Channel) => (...args: import("./client").SubscribeParams) => ReturnType<Channel['consume']>,
 *   ['api']: () => ApiConstructor
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
     * @template T
     * @param {(tail: Promise<T>) => Promise<any>} fn
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
 * @param {object} context
 * @param {T} original
 * @param {Scopes} scope
 * @param {Plugin[]} plugins
 * @return {T}
 */
function stack(context, original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, context)(next), original);
}


//
// Client endpoint
//

/**
 * @param {ApiConstructor} apiClass
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
                    this.aborted.then(this.close.bind(this));
                    return conn;
                });

            this.createChannel = () =>
                /** @type {Promise<Connection>} */ (this.conn)
                    .then((conn) => this.factories.channel(conn)());

            // open channel(s) using the created connection
            this.ch = this.createChannel()
                .then((ch) => {
                    ch.publish = this.factories.publication(ch);
                    ch.consume = this.factories.subscription(ch);
                    return ch;
                })
                .then(tap(ready)) // notify the ready status of the channel
                .catch(abort);

            // return a promise to be resolved after the assertions
            return this._asserted().then(() => this);
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
 * Entry point for users. able to start the connection with.
 *
 * @typedef {(url?: string | object, options?: Options) => Client} ClientConstructor
 * @typedef {{
 *   start: (url?: string | object, options?: Options) => Promise<Client>,
 *   close: () => void
 * }} Client
 *
 * @type {ClientConstructor & Pick<Client, 'start'>}
 */
const Client = module.exports = function(url, options = {}) {

    // parse user options
    const {
        logger = console,
        plugins = [],
        ...opts
    } = options;

    // context to be passed to plugins. should be smallest
    const context = {
        logger
    };

    // factories of core method/classes. decorated by plugins
    /** @type {Factories} */
    const factories = {
        [Scopes.CONNECTION]: () => stack(
            context, connect.bind(context), Scopes.CONNECTION, plugins),
        [Scopes.CHANNEL]: (conn) => stack(
            context, conn.createConfirmChannel.bind(conn), Scopes.CHANNEL, plugins),
        [Scopes.PUBLICATION]: (ch) => stack(
            context, ch.publish.bind(ch), Scopes.PUBLICATION, plugins),
        [Scopes.SUBSCRIPTION]: (ch) => stack(
            context, ch.consume.bind(ch), Scopes.SUBSCRIPTION, plugins),
        [Scopes.API]: () => stack(
            context, ContextChannel, Scopes.API, plugins)
    };

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
