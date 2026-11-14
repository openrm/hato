//
// Imports
//

const assert = require('assert');

const { EventEmitter } = require('events');
const consumers = require('./consumer');
const defaults = require('./defaults');
const ack = require('./ack');
const { ExchangeTypes } = require('./constants');
const { tap } = require('./utils');


//
// Constants
//

const exchangeTypes = Object.values(ExchangeTypes);




//
// API class
//

/**
 * Class to hold a certain context about to what exchange/queue
 * to publish or consume messages.
 */
class ContextChannel extends EventEmitter {

    constructor(context, {
        logger,
        abort,
        _assert,
        _asserted,
        _self
    }) {
        super();

        this._context = {
            queue: '',
            exchange: '',
            assert: true,
            prefetch: 0,
            ...context
        };

        // add readonly properties

        this.logger = logger;
        this.abort = abort;
        this._assert = _assert;
        this._asserted = _asserted;
        this._self = _self;
    }

    /**
     * Enable/Disable assertions of exchanges and queues.
     */
    assert(assert = true) {
        return this.context({ assert });
    }

    /**
     * Set the prefetch count that is applied to any consumption
     * under the context.
     */
    prefetch(count) {
        return this.context({ prefetch: count });
    }

    /**
     * Enable/Disable assertions of exchanges and queues.
     */
    context(context) {
        return new this._self({
            ...this._context,
            ...context
        }, this);
    }

    /**
     * Alias for the pre-defined exchanges.
     */
    type(type) {
        return this.exchange(null, type);
    }

    /**
     * Assert or refer to an exchange.
     */
    exchange(name, type, options) {
        assert(name || type,
            'ContextChannel.exchange() requires either `name` or `type`');

        assert(!type || exchangeTypes.includes(type),
            `Exchange type ${type} not valid`);

        const { assert: _assertion } = this._validateContext();
        const assertion = _assertion &&
            typeof name === 'string' &&
            typeof type === 'string';

        // when the name is not specified, use default exchange for each type
        const _name = name === null && type ?
            defaults.resolveExchange(type) : name || '';
        const _type = type || 'direct';

        const assertExchange = assertion ?
            // assert the specified exchange
            (ch) => ch.assertExchange(_name, _type, options) :
            // no need for that when it is a default exchange
            (ch) => ch.checkExchange(_name);

        this._assert((channel) => channel
            .then(assertExchange)
            .then(({ exchange: ex }) => {
                if (ex) {
                    this.logger.debug(
                        `[AMQP] Exchange ${type}/${ex} ` +
                        `${assertion ? 'asserted' : 'checked'}.`);
                }
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] ${assertion ? 'Assertion' : 'Check'} ` +
                    `for exchange ${type}/${_name} failed.`,
                    err.message);
                // assertion error should destroy the connection
                this.abort(err);
                throw err;
            }));

        // create a new context with the exchange
        return new this._self({
            ...this._context,
            exchange: _name
        }, this);
    }

    /**
     * Assert or refer to a queue.
     */
    queue(name, options) {
        const { assert: assertion } = this._validateContext();
        this._assert((channel) => channel
            .then((ch) => assertion ?
                ch.assertQueue(name, options) : ch.checkQueue(name))
            .then(({ queue: q }) => {
                this.logger.debug(`[AMQP] Queue ${q} ${assertion ? 'asserted' : 'checked'}.`);
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for queue ${name} failed.`,
                    err.message);
                // assertion error should destroy the connection
                this.abort(err);
                throw err;
            }));

        return new this._self({
            ...this._context,
            queue: name || ''
        }, this);
    }

    /**
     * Verify and format the context to publish/consume messages.
     */
    _validateContext() {
        let { queue, exchange } = this._context;
        if (exchange === '' && queue !== '') {
            exchange = defaults.resolveExchange(ExchangeTypes.DIRECT);
        }
        return this._context = { ...this._context, queue, exchange };
    }

    /**
     * Alias for consume().
     */
    subscribe(binding, fn, options) {
        return this.consume(binding, fn, options);
    }

    /**
     * Bind a queue to an exchange and start consuming.
     */
    consume(binding, fn, options) {
        // allow to omit the binding key for use with fanout exchanges
        if (arguments.length === 1) return this.consume('', fn);

        assert(typeof binding === 'string' || binding &&
            typeof binding === 'object', 'Binding key or object not valid');

        const { queue, exchange, assert: assertion, prefetch } = this._validateContext();

        const qos = prefetch > 0 ?
            (ch) => ch.prefetch(prefetch).then(() => ch) :
            (ch) => Promise.resolve(ch);

        let bind;
        const opts = defaults.options.anonymousQueue;

        if (exchange === '') {
            assert(typeof binding === 'string');
            // using the default exchange
            // (messages are sent to a queue with name same as the binding key)
            bind = (ch) => ch.assertQueue(binding, opts)
                .then(({ queue }) => ({ queue, ch }));
        } else {
            // otherwise explicitly bind to an exchange
            bind = (ch) => {
                const fallbackQueue = queue === '' && assertion ?
                    ch.assertQueue('', opts).then(({ queue: q }) => q) :
                    Promise.resolve(queue);

                return fallbackQueue
                    .then((q) => ({ ch, queue: q }))
                    .then(({ ch, queue }) => {
                        const bind = typeof binding === 'string' ?
                            ch.bindQueue(queue, exchange, binding) :
                            ch.bindQueue(queue, exchange, '', binding);
                        return bind.then(() => ({ ch, queue }));
                    });
            };
        }

        // start consuming in the assertion phase.
        const consume = (emitter) =>
            this._assert((ch) => ch
                .then(qos)
                .then(bind)
                .then(({ ch, queue }) => this._consume(ch, queue, fn, options, emitter)));

        return consumers.create(consume);
    }

    _consume(ch, queue, fn, options, emitter = new EventEmitter()) {
        let tag;
        const handler = (msg) => {
            if (!msg) return fn(msg);
            Object.defineProperties(msg, ack.createState(ch, msg));
            // wrap (possibly sync.) handler in a promise.
            return Promise.resolve()
                .then(() => fn(msg))
                .catch((err) => emitter.emit('error', err, msg))
                .catch((err) => {
                    this.logger.error(
                        `[AMQP] Detected unhandled rejection on handler ${tag}:`,
                        err);
                });
        };
        return ch.consume(queue, handler, options)
            .then(tap(({ consumerTag }) => tag = consumerTag))
            .then((consumer) => Object.defineProperty(
                consumer, 'cancel', {
                    value: () => ch.cancel(consumer.consumerTag)
                }));
    }

    /**
     * Stop delivering to the consumer.
     */
    cancel(consumerTag) {
        return this._asserted()
            .then((ch) => ch.cancel(consumerTag));
    }

    /**
     * Publish a message with the specified routing key.
     */
    publish(routingKey, content, options = {}) {
        const { exchange } = this._validateContext();
        return this._asserted()
            .then((ch) => {
                const confirmMode = typeof ch.waitForConfirms === 'function';
                return new Promise((resolve, reject) => {
                    const cb = (err) => err ? reject(err) : resolve();
                    try {
                        const ok = confirmMode ?
                            ch.publish(exchange, routingKey, content, options, cb) :
                            ch.publish(exchange, routingKey, content, options);
                        if (!ok) throw new Error('Message could not be sent due to flow control');
                        else if (!confirmMode) resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            });
    }

}


//
// Exports
//

module.exports = ContextChannel;
