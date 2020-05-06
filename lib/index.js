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
        connected,
        ch,
        abort,
        _assert
    }) {
        this._context = context || {
            queue: '',
            exchange: ''
        };

        this.logger = logger,
            this.connected = connected,
            this._assert = _assert,
            this.abort = abort,
            this.ch = ch;
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

        return new ContextChannel({
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

        return new ContextChannel({
            ...this._context,
            queue: name || ''
        }, this);
    }

    _validateContext() {
        let { queue, exchange } = this._context;
        if (exchange === '' && queue !== '') {
            exchange = defaults.resolveExchange(ExchangeTypes.DIRECT);
        }
        this._context = { ...this._context, queue, exchange };
    }

    subscribe() {
        return this.consume.apply(this, arguments);
    }

    consume(binding, fn) {
        if (arguments.length === 1) return this.consume('', fn);

        assert(typeof binding === 'string'
            || binding && typeof binding === 'object',
            'Binding key or object not valid');

        this._validateContext();
        const { queue, exchange } = this._context;

        let bind;
        const opts = defaults.options.anonymousQueue;

        if (exchange === '') {
            bind = this.connected
                .then((ch) => {
                    return ch.assertQueue(binding, opts)
                        .then(({ queue }) => ({ queue, ch }))
                });
        } else {
            bind = this.connected
                .then((ch) => {
                    const fallbackQueue = queue === '' ?
                        ch.assertQueue('', opts).then(({ queue: q }) => q)
                        : Promise.resolve(queue)

                    return fallbackQueue.then((q) => ({ ch, queue: q }));
                })
                .then(({ ch, queue }) => {
                    const args = typeof binding === 'string' ?
                        [queue, exchange, binding] : [queue, exchange, '', binding];
                    return ch.bindQueue(...args).then(() => ({ ch, queue }));
                })
        }

        return bind.then(({ ch, queue }) => ch.consume(queue, fn));
    }

    publish(routingKey, msg, options = {}) {
        const { exchange } = this._context;
        return this.connected
            .then((ch) => {
                return new Promise((resolve, reject) => {
                    const conf = (err) => {
                        if (err) reject(err);
                        else resolve();
                    };
                    ch.publish(exchange, routingKey, msg, options, conf);
                });
            })
    }

}

class Client extends ContextChannel {

    constructor(url, options = {}) {
        const {
            logger = console,
            plugins = [],
            ...opts
        } = options;

        const { subscribe: connected, broadcast: ready } = createSubject();

        // add assertion before consuming
        const _assert = (fn) => { this.connected = fn(connected) };

        const { subscribe: cancelled, broadcast: cancel } = createSubject();

        super(null, {
            logger,
            connected,
            abort: cancel,
            _assert,
        });

        const context = {
            logger,
            cancelled,
            cancel
        };

        this.factories = {
            connection: () => stack.call(
                context, connect.bind(context, url, opts), Scopes.CONNECTION, plugins),
            channel: (conn) => stack.call(
                context, conn.createConfirmChannel.bind(conn), Scopes.CHANNEL, plugins)
        };

        this.logger = logger,
            this.ready = ready,
            this.aborted = cancelled;
    }

    static start(url, options = {}) {
        const client = new Client(url, options);
        return client.start();
    }

    start() {
        const ready = this.ready, abort = this.abort;

        this.connect = this.factories.connection();
        this.conn = this.connect()
            .then((conn) => {
                this.aborted.then(() => conn.close());
                return conn;
            });

        this.createChannel = () => this.conn
            .then((conn) => this.factories.channel(conn)());
        this.ch = this.createChannel().then(tap(ready)).catch(abort);

        return this.connected.then(() => this);
    }

}

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}

module.exports = Client;
