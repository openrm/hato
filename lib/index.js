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
    fn();
    return arg;
};

class Client {

    constructor(url, options = {}) {
        const {
            logger = console,
            plugins = [],
            ...opts
        } = options;

        const { subscribe: cancelled, broadcast: cancel } = createSubject();

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

        const { subscribe: connected, broadcast: ready } = createSubject();

        this.logger = logger,
            this.connected = connected,
            this.ready = ready,
            this.abort = cancel;

        this._resetContext();
    }

    static start(url, options = {}) {
        const client = new Client(url, options);
        return client.start();
    }

    start() {
        const ready = this.ready, abort = this.abort;

        this.connect = this.factories.connection();
        this.conn = this.connect();

        this.createChannel = () => this.conn
            .then((conn) => this.factories.channel(conn)());
        this.ch = this.createChannel().then(tap(ready)).catch(abort);

        return this.connected.then(() => this);
    }

    _resetContext() {
        this._context = {
            queue: '',
            exchange: {
                type: ExchangeTypes.DIRECT,
                name: null
            }
        };
    }

    exchange(...args) {
        let type, name, options;

        if (args.length === 1) name = args[0];
        else [type, name, options] = args;

        assert(!type || exchangeTypes.includes(type),
            `Exchange type ${type} not valid`);

        const assertExchange = args.length === 1 ?
            (ch) => ch.checkExchange(name) :
            (ch) => ch.assertExchange(name, type, options);

        this.connected = this.connected
            .then(() => this.ch)
            .then(assertExchange)
            .then(({ exchange: ex }) => {
                ex && this.logger.debug(`[AMQP] Exchange ${type}/${ex} asserted.`);
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for exchange ${type}/${name} failed.`,
                    err.message);
            });
        this._context.exchange = {
            type,
            name: name !== undefined ? name : null
        };
        return this;
    }

    queue(name, options) {
        this.connected = this.connected
            .then(() => this.ch)
            .then((ch) => ch.assertQueue(name, options))
            .then(({ queue: q }) => {
                this.logger.debug(`[AMQP] Queue ${q} asserted.`);
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for queue ${name} failed.`,
                    err.message);
            });
        this._context.queue = name || '';
        return this;
    }

    subscribe() {
        return this.consume.apply(this, arguments);
    }

    consume(binding, fn) {
        if (arguments.length === 1) return this.consume('', fn);

        const { queue, exchange: { type, name } } = this._context;
        const inferredType = type === ExchangeTypes.DIRECT
            && (binding.includes('#') || binding.includes('*')) ?
            ExchangeTypes.TOPIC : type;
        const exchange = name !== null ?
            name :
            defaults.resolveExchange(inferredType);
        this._resetContext();

        assert(typeof binding === 'string'
            || binding && typeof binding === 'object',
            'Binding key or object not valid');

        return this.connected
            .then(() => this.ch)
            .then((ch) => {
                const opts = defaults.options.anonymousQueue;
                const assertQueue = queue === '' ?
                    ch.assertQueue('', opts).then(({ queue: q }) => q)
                    : Promise.resolve(queue)

                return assertQueue.then((q) => ({ ch, queue: q }));
            })
            .then(({ ch, queue }) => {
                const args = typeof binding === 'string' ?
                    [queue, exchange, binding] : [queue, exchange, '', binding];
                return ch.bindQueue(...args).then(() => ({ ch, queue }));
            })
            .then(({ ch, queue }) => ch.consume(queue, fn));
    }

}

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}

module.exports = Client;
