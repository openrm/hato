//
// Imports
//

const assert = require('assert');
const { EventEmitter } = require('events');
const defaults = require('./defaults');
const { ExchangeTypes } = require('./constants');
const { tap } = require('./utils');


//
// Constants
//

const exchangeTypes = Object.values(ExchangeTypes);


//
// API class
//

// class to hold a certain context about to what exchange/queue
// to publish or consume messages
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

        // add readonly properties
        Object.entries({
            logger,
            abort,
            _assert,
            _asserted,
            _self
        }).forEach(([key, value]) => Object.defineProperty(this, key, { value }));
    }

    // assert or refer to an exchange
    exchange(name, type, options) {
        assert(name || type,
            'ContextChannel.exchange() requires either `name` or `type`');

        assert(!type || exchangeTypes.includes(type),
            `Exchange type ${type} not valid`);

        const assertion = name && type;
        // when the name is not specified, use default exchange for each type
        name = name === null && type ?
            defaults.resolveExchange(type) : name;

        const assertExchange = assertion ?
            // assert the specified exchange
            (ch) => ch.assertExchange(name, type, options) :
            // no need for that when it is a default exchange
            (ch) => ch.checkExchange(name);

        this._assert(channel => channel
            .then(assertExchange)
            .then(({ exchange: ex }) => {
                ex && this.logger.debug(`[AMQP] Exchange ${type}/${ex} asserted.`);
            })
            .catch((err) => {
                this.logger.error(
                    `[AMQP] Assertion for exchange ${type}/${name} failed.`,
                    err.message);
                // assertion error should destroy the connection
                this.abort(err);
                throw err;
            }));

        // create a new context with the exchange
        return new this._self({
            ...this._context,
            exchange: name
        }, this);
    }

    // assert or refer to a queue
    queue(name, options) {
        this._assert(channel => channel
            .then((ch) => ch.assertQueue(name, options))
            .then(({ queue: q }) => {
                this.logger.debug(`[AMQP] Queue ${q} asserted.`);
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

    // verify and format the context to publish/consume messages
    _validateContext() {
        let { queue, exchange } = this._context;
        if (exchange === '' && queue !== '') {
            exchange = defaults.resolveExchange(ExchangeTypes.DIRECT);
        }
        return this._context = { ...this._context, queue, exchange };
    }

    // an alias for consume()
    subscribe() {
        return this.consume.apply(this, arguments);
    }

    // bind a queue to an exchange and start consuming
    consume(binding, fn, options) {
        // allow to omit the binding key for use with fanout exchanges
        if (arguments.length === 1) return this.consume('', fn);

        assert(typeof binding === 'string'
            || binding && typeof binding === 'object',
        'Binding key or object not valid');

        const { queue, exchange } = this._validateContext();

        let bind;
        const opts = defaults.options.anonymousQueue;

        if (exchange === '') {
            // using the default exchange
            // (messages are sent to a queue with name same as the binding key)
            bind = (ch) => ch
                .then((ch) => {
                    return ch.assertQueue(binding, opts)
                        .then(({ queue }) => ({ queue, ch }));
                });
        } else {
            // otherwise explicitly bind to an exchange
            bind = (ch) => ch
                .then((ch) => {
                    const fallbackQueue = queue === '' ?
                        ch.assertQueue('', opts).then(({ queue: q }) => q) :
                        Promise.resolve(queue);

                    return fallbackQueue.then((q) => ({ ch, queue: q }));
                })
                .then(({ ch, queue }) => {
                    const args = typeof binding === 'string' ?
                        [queue, exchange, binding] : [queue, exchange, '', binding];
                    return ch.bindQueue(...args).then(() => ({ ch, queue }));
                });
        }

        // start consuming in the assertion phase
        return this._assert((ch) => bind(ch)
            .then(({ ch, queue }) => this._consume(ch, queue, fn, options)));
    }

    _consume(ch, queue, fn, options) {
        // provides a way to debug errors
        const emitter = new EventEmitter();
        let tag;
        const handler = (msg) => {
            // wrap (possibly sync.) handler in a promise.
            return Promise.resolve()
                .then(() => fn(Object.assign(msg, {
                    ack: ch.ack.bind(ch, msg),
                    nack: ch.nack.bind(ch, msg),
                    // nack() does not work on RabbitMQ < v2.3.0,
                    // use reject() instead
                    reject: ch.reject.bind(ch, msg)
                })))
                .catch(emitter.emit.bind(emitter, 'error'))
                .catch((err) => {
                    this.logger.error(
                        `[AMQP] Detected unhandled rejection on handler ${tag}:`,
                        err);
                });
        };
        return ch.consume(queue, handler, options)
            .then(tap(({ consumerTag }) => tag = consumerTag))
            .then((consumer) =>
                Object.assign(consumer, { consumer: emitter }));
    }

    // publish a message with the specified routing key
    publish(routingKey, content, options = {}) {
        const { exchange } = this._validateContext();
        return this._asserted()
            .then((ch) => {
                const confirmMode = typeof ch.waitForConfirms === 'function';
                return new Promise((resolve, reject) => {
                    const cb = (err) => err ? reject(err) : resolve();
                    try {
                        const ok = ch.publish(exchange, routingKey, content, options, cb);
                        if (!ok) {
                            reject(new Error('Message could not be sent due to flow control'));
                        }
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
