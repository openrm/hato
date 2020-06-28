//
// Imports
//

/**
 * @type {(value: any, message?: string) => asserts value}
 */
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
// Types
//

/**
 * @typedef {import('./client').Channel & import('./client').ConfirmChannel} Channel
 * @typedef {import('amqplib').Message} Message
 * @typedef {import('amqplib').ConsumeMessage} ConsumeMessage
 * @typedef {import('amqplib').Replies.Empty} EmptyReply
 * @typedef {import('amqplib').Replies.Consume} ConsumeReply
 */
/**
 * @template T
 * @typedef {import('./consumer').Consumer<T>} Consumer<T>
 */

/**
 * @typedef {{ exchange: string, queue: string, assert: boolean }} Context
 */

/**
 * @callback Handler
 * @param {ConsumeMessage | null} msg
 * @return {any}
 */

/**
 * @typedef {{
 *   logger: import('./types').Logger,
 *   abort: (reason: Error) => void,
 *   _assert: {<T>(assertion: (ch: Promise<Channel>) => Promise<T>): Promise<T>},
 *   _asserted: () => Promise<Channel>,
 *   _self: typeof ContextChannel
 * }} ChannelProperties
 */


//
// API class
//

/**
 * Class to hold a certain context about to what exchange/queue
 * to publish or consume messages.
 */
class ContextChannel extends EventEmitter {

    /**
     * @constructor
     * @param {Context | null} context
     * @param {ChannelProperties} properties
     */
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
            ...context
        };

        // add readonly properties

        /** @readonly */
        this.logger = logger;
        /** @readonly */
        this.abort = abort;
        /** @readonly */
        this._assert = _assert;
        /** @readonly */
        this._asserted = _asserted;
        /** @readonly */
        this._self = _self;
    }

    /**
     * Enable/Disable assertions of exchanges and queues.
     *
     * @param {boolean} assert
     * @return {ContextChannel}
     */
    assert(assert = true) {
        return this.context({ assert });
    }

    /**
     * Enable/Disable assertions of exchanges and queues.
     *
     * @param {Partial<Context>} context
     * @return {ContextChannel}
     */
    context(context) {
        return new this._self({
            ...this._context,
            ...context
        }, this);
    }

    /**
     * Alias for the pre-defined exchanges.
     *
     * @param {string} type
     */
    type(type) {
        return this.exchange(null, type);
    }

    /**
     * Assert or refer to an exchange.
     *
     * @param {string | null} name
     * @param {string} [type]
     * @param {object} [options]
     * @return {ContextChannel}
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

        /** @type {(ch: Channel) => Promise<{ exchange: string }>} */
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
     *
     * @param {string} name
     * @param {object} [options]
     * @return {ContextChannel}
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
     *
     * @return {Context}
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
     *
     * @param {string | object} binding
     * @param {Handler} fn
     * @param {object} [options]
     * @return {Consumer<ConsumeReply>}
     */
    subscribe(binding, fn, options) {
        return this.consume(binding, fn, options);
    }

    /**
     * Bind a queue to an exchange and start consuming.
     *
     * @param {string | object} binding
     * @param {Handler} fn
     * @param {object} [options]
     * @return {Consumer<ConsumeReply>}
     */
    consume(binding, fn, options) {
        // allow to omit the binding key for use with fanout exchanges
        if (arguments.length === 1) return this.consume('', fn);

        assert(typeof binding === 'string' || binding &&
            typeof binding === 'object', 'Binding key or object not valid');

        const { queue, exchange, assert: assertion } = this._validateContext();

        /** @type {(ch: Promise<Channel>) => Promise<{ ch: Channel, queue: string }>} */
        let bind;
        const opts = defaults.options.anonymousQueue;

        if (exchange === '') {
            assert(typeof binding === 'string');
            // using the default exchange
            // (messages are sent to a queue with name same as the binding key)
            bind = (ch) => ch
                .then((ch) => ch.assertQueue(binding, opts)
                    .then(({ queue }) => ({ queue, ch })));
        } else {
            // otherwise explicitly bind to an exchange
            bind = (ch) => ch
                .then((ch) => {
                    const fallbackQueue = queue === '' && assertion ?
                        ch.assertQueue('', opts).then(({ queue: q }) => q) :
                        Promise.resolve(queue);

                    return fallbackQueue.then((q) => ({ ch, queue: q }));
                })
                .then(({ ch, queue }) => {
                    const bind = typeof binding === 'string' ?
                        ch.bindQueue(queue, exchange, binding) :
                        ch.bindQueue(queue, exchange, '', binding);
                    return bind.then(() => ({ ch, queue }));
                });
        }

        // start consuming in the assertion phase.
        /** @param {EventEmitter} emitter */
        const consume = (emitter) =>
            this._assert((ch) => bind(ch)
                .then(({ ch, queue }) => this._consume(ch, queue, fn, options, emitter)));

        return consumers.create(consume);
    }

    /**
     * @param {Channel} ch
     * @param {string} queue
     * @param {Handler} fn
     * @param {object} [options]
     * @param {EventEmitter} [emitter]
     * @return {Promise<ConsumeReply>}
     */
    _consume(ch, queue, fn, options, emitter = new EventEmitter()) {
        /** @type {string} */
        let tag;
        /** @type {Handler} */
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
     *
     * @param {string} consumerTag
     * @return {Promise<EmptyReply>}
     */
    cancel(consumerTag) {
        return this._asserted()
            .then((ch) => ch.cancel(consumerTag));
    }

    /**
     * Publish a message with the specified routing key.
     *
     * @param {string} routingKey
     * @param {Buffer} content
     * @param {object} [options]
     * @return {Promise<boolean>}
     */
    publish(routingKey, content, options = {}) {
        const { exchange } = this._validateContext();
        return this._asserted()
            .then((ch) => {
                const confirmMode = typeof ch.waitForConfirms === 'function';
                return new Promise((resolve, reject) => {
                    /** @type {(err: Error) => void} */
                    const cb = (err) => err ? reject(err) : resolve();
                    try {
                        const ok = ch.publish(exchange, routingKey, content, options, cb);
                        if (!ok) {
                            reject(new Error('Message could not be sent due to flow control'));
                        } else if (!confirmMode) resolve();
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
