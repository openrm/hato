//
// Imports
//

const ContextChannel = require('./api');
const { connect } = require('./client');
const { Scopes } = require('./constants');
const { tap } = require('./utils');


//
// Utilities
//

const noop = () => {};

// create an observable subject.
const createSubject = () => {
    let broadcast, subscribe = new Promise((resolve) => broadcast = resolve);
    return { broadcast, subscribe };
};

const createExtendable = () => {
    // observable to notify that the connection (and channels) are ready
    const { subscribe, broadcast } = createSubject();

    let asserted = subscribe;

    // extend the promise chain by assertions
    // that are made before publishing
    const extend = (fn) => {
        const assert = fn(asserted);
        asserted = assert.then(() => subscribe);
        return assert;
    };

    return { extend, subscribe: () => asserted, broadcast };
};

// create a factory funtion by wrapping the original with the plugins enabled
function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}

// define read-only properties on an object
function defineProperties(obj, properties) {
    Object.entries(properties)
        .forEach(([key, value]) => Object.defineProperty(obj, key, { value }));
    return obj;
}


//
// Client endpoint
//

function getClientClass(apiClass) {

    // internal class
    class Client extends apiClass {

        constructor({
            factories,
            ready,
            aborted,
            logger,
            abort,
            _assert,
            _asserted,
            _onClose = noop
        }) {
            super(null, {
                logger,
                abort,
                _assert,
                _asserted,
                _self: apiClass
            });

            defineProperties(this, {
                ready,
                aborted,
                factories,
                _onClose
            });
        }

        static start(url, options = {}) {
            // immediately start the connection
            return new Client(url, options).start();
        }

        start() {
            const ready = this.ready, abort = this.abort;

            this.connect = this.factories.connection();

            // initiate connection to the broker
            this.conn = this.connect()
                .then((conn) => {
                    conn.on('close', this._onClose);
                    this.aborted.then(this.close.bind(this));
                    return conn;
                });

            this.createChannel = () => this.conn
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
            return this.conn
                .then((conn) => conn.close())
                .catch((err) => {
                    this.logger.warn('[AMQP] An error occurred when closing a connection', err.message);
                });
        }

    }

    return Client;

}

// the entry point for users. able to start the connection with
const Client = function(url, options = {}) {

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
    const factories = {
        connection: () => stack.call(
            context, connect.bind(context, url, opts), Scopes.CONNECTION, plugins),
        channel: (conn) => stack.call(
            context, conn.createConfirmChannel.bind(conn), Scopes.CHANNEL, plugins),
        publication: (ch) => stack.call(
            context, ch.publish.bind(ch), Scopes.PUBLICATION, plugins),
        subscription: (ch) => stack.call(
            context, ch.consume.bind(ch), Scopes.SUBSCRIPTION, plugins),
        api: () => stack.call(
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
            typeof plugin.destroy === 'function' && plugin.destroy())
    });

};


//
// Exports
//

module.exports = Client;
