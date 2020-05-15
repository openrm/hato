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

// create an observable subject.
const createSubject = () => {
    let broadcast, subscribe = new Promise((resolve) => broadcast = resolve);
    return { broadcast, subscribe };
};

// create a factory funtion by wrapping the original with the plugins enabled
function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}


//
// Client endpoint
//

// the entry point for users. able to start the connection with
const Client = function(url, options = {}) {

    // parse user options
    const {
        logger = console,
        plugins = [],
        ...opts
    } = options;

    // observable to notify that the connection (and channels) are ready
    const { subscribe: connected, broadcast: ready } = createSubject();

    let asserted = connected;

    // extend the promise chain by assertions
    // that are made before publishing
    const _assert = (fn) => {
        const assert = fn(asserted);
        asserted = assert.then(() => connected);
        return assert;
    };

    // observable to be fired when aborting all operations and tearing down
    const { subscribe: cancelled, broadcast: abort } = createSubject();

    // context to be passed to plugins. should be smallest
    const context = {
        logger,
        cancelled,
        cancel: abort
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

    // extended API
    const parentClass = factories.api();

    // internal class
    class Client extends parentClass {

        constructor() {
            super(null, {
                logger,
                abort,
                _assert,
                _asserted: () => asserted,
                _self: parentClass
            });

            this.ready = ready,
            this.aborted = cancelled;
        }

        static start(url, options = {}) {
            // immediately start the connection
            return new Client(url, options).start();
        }

        start() {
            const ready = this.ready, abort = this.abort;

            this.connect = factories.connection();

            // initiate connection to the broker
            this.conn = this.connect()
                .then((conn) => {
                    this.aborted.then(this.close);
                    return conn;
                });

            this.createChannel = () => this.conn
                .then((conn) => factories.channel(conn)());

            // open channel(s) using the created connection
            this.ch = this.createChannel()
                .then((ch) => {
                    ch.publish = factories.publication(ch);
                    ch.consume = factories.subscription(ch);
                    return ch;
                })
                .then(tap(ready)) // notify the ready status of the channel
                .catch(abort);

            // return a promise to be resolved after the assertions
            return this._asserted().then(() => this);
        }

        close() {
            return this.conn.then((conn) => conn.close())
                .catch((err) => {
                    this.logger.warn('[AMQP] An error occurred when closing a connection', err.message);
                });
        }

    }

    return new Client();

};


//
// Exports
//

module.exports = Client;
