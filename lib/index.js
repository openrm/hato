const assert = require('assert');
const { connect } = require('./client');
const defaults = require('./defaults');
const { Scopes, ExchangeTypes } = require('./constants');

const exchangeTypes = Object.keys(ExchangeTypes).map((key) => ExchangeTypes[key]);

const createSubject = () => {
    let broadcast, subscribe = new Promise((resolve) => broadcast = resolve);
    return { broadcast, subscribe };
};

const tap = (fn) => (arg) => {
    fn(arg);
    return arg;
};

class ContextChannel {

    constructor(context, {
        logger,
        abort,
        _assert,
        _asserted,
        _self
    }) {
        this._context = context || {
            queue: '',
            exchange: ''
        };

        Object.entries({
            logger,
            abort,
            _assert,
            _asserted,
            _self
        }).forEach(([key, value]) => Object.defineProperty(this, key, { value }));
    }

    exchange(name, type, options) {
        assert(name || type,
            'ContextChannel.exchange() requires either `name` or `type`');

        const assertion = name && type;
        name = name === null && type ?
            defaults.resolveExchange(type) : name;

        assert(!type || exchangeTypes.includes(type),
            `Exchange type ${type} not valid`);

        const assertExchange = assertion ?
            (ch) => ch.assertExchange(name, type, options) :
            (ch) => ch.checkExchange(name);

        this._assert(channel => channel
            .then(assertExchange)
            .then(({ exchange: ex }) => {
                ex && this.logger.debug(`[AMQP] Exchange ${type}/${ex} asserted.`);
                return channel;
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for exchange ${type}/${name} failed.`,
                    err.message);
                this.abort(err);
                throw err;
            }));

        return new this._self({
            ...this._context,
            exchange: name
        }, this);
    }

    queue(name, options) {
        this._assert(channel => channel
            .then((ch) => ch.assertQueue(name, options))
            .then(({ queue: q }) => {
                this.logger.debug(`[AMQP] Queue ${q} asserted.`);
                return channel;
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for queue ${name} failed.`,
                    err.message);
                this.abort(err);
                throw err;
            }));

        return new this._self({
            ...this._context,
            queue: name || ''
        }, this);
    }

    _validateContext() {
        let { queue, exchange } = this._context;
        if (exchange === '' && queue !== '') {
            exchange = defaults.resolveExchange(ExchangeTypes.DIRECT);
        }
        return this._context = { ...this._context, queue, exchange };
    }

    subscribe() {
        return this.consume.apply(this, arguments);
    }

    consume(binding, fn, options) {
        if (arguments.length === 1) return this.consume('', fn);

        assert(typeof binding === 'string'
            || binding && typeof binding === 'object',
        'Binding key or object not valid');

        const { queue, exchange } = this._validateContext();

        let bind;
        const opts = defaults.options.anonymousQueue;

        if (exchange === '') {
            bind = (ch) => ch
                .then((ch) => {
                    return ch.assertQueue(binding, opts)
                        .then(({ queue }) => ({ queue, ch }));
                });
        } else {
            bind = (ch) => ch
                .then((ch) => {
                    const fallbackQueue = queue === '' ?
                        ch.assertQueue('', opts).then(({ queue: q }) => q)
                        : Promise.resolve(queue);

                    return fallbackQueue.then((q) => ({ ch, queue: q }));
                })
                .then(({ ch, queue }) => {
                    const args = typeof binding === 'string' ?
                        [queue, exchange, binding] : [queue, exchange, '', binding];
                    return ch.bindQueue(...args).then(() => ({ ch, queue }));
                });
        }

        return this._assert((ch) => bind(ch)
            .then(({ ch, queue }) => this._consume(ch, queue, fn, options)));
    }

    _consume(ch, queue, fn, options) {
        const handler = (msg) => {
            return fn(Object.assign(msg, {
                ack: ch.ack.bind(ch, msg),
                nack: ch.reject.bind(ch, msg)
            }));
        };
        return ch.consume(queue, handler, options);
    }

    publish(routingKey, msg, options = {}) {
        const { exchange } = this._validateContext();
        return this._asserted()
            .then((ch) => {
                return new Promise((resolve, reject) => {
                    const cb = (err) => err ? reject(err) : resolve();
                    if (!ch.publish(exchange, routingKey, msg, options, cb)) {
                        reject(new Error('Message could not be sent due to flow control'));
                    }
                });
            });
    }

}

const Client = function(url, options = {}) {

    const {
        logger = console,
        plugins = [],
        ...opts
    } = options;

    const { subscribe: connected, broadcast: ready } = createSubject();

    // add assertion before consuming
    let asserted = connected;
    const _assert = (fn) => {
        const assert = fn(asserted);
        asserted = assert.then(() => connected);
        return assert;
    };

    const { subscribe: cancelled, broadcast: abort } = createSubject();

    const context = {
        logger,
        cancelled,
        cancel: abort
    };

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

    const parentClass = factories.api();

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
            return new Client(url, options).start();
        }

        start() {
            const ready = this.ready, abort = this.abort;

            this.connect = factories.connection();
            this.conn = this.connect()
                .then((conn) => {
                    this.aborted.then(() => this.close());
                    return conn;
                });

            this.createChannel = () => this.conn
                .then((conn) => factories.channel(conn)());
            this.ch = this.createChannel()
                .then((ch) => {
                    ch.publish = factories.publication(ch);
                    ch.consume = factories.subscription(ch);
                    return ch;
                })
                .then(tap(ready))
                .catch(abort);

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

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}

module.exports = Client;
