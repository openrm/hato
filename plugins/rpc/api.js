const { EventEmitter } = require('events');
const { promise } = require('../helpers');
const { TimeoutError } = require('../../lib/errors');
const errors = require('./errors');

/**
 * @typedef {import('../../lib/api')} ContextChannel
 *
 * @typedef {object} RPCMethods
 * @property {EventEmitter} _resp
 * @property {any} rpc
 *
 * @typedef {ContextChannel & RPCMethods} RPCChannel
 */

/** @this {RPCChannel} */
function rpc(routingKey, msg, { uid, timeout, ...options }) {
    const correlationId = uid.generate();

    const rpc = makeRpc.bind(this, routingKey, msg);

    return this._asserted()
        .then((ch) => ch.assertQueue('', {
            durable: false,
            exclusive: true,
            autoDelete: true
        }))
        .then(({ queue: replyTo }) =>
            new Promise(rpc({ replyTo, correlationId, timeout, ...options })));
}

function ackOnce(msg) {
    let acked = false;
    const once = (fn) => (...args) => {
        if (acked) return;
        else acked = true;
        return fn(...args);
    };
    msg.ack = once(msg.ack.bind(msg));
    msg.nack = once(msg.nack.bind(msg));
    msg.reject = once(msg.reject.bind(msg));
    return msg;
}

/**
 * @this {RPCChannel}
 * @param {(msg: any) => Promise<any>} fn
 * @return {(msg: any) => Promise<any>} fn
 */
function reply(fn) {
    return (msg) => {
        const {
            replyTo,
            correlationId
        } = msg.properties;

        // not a rpc
        if (!replyTo) return fn(msg);

        msg = ackOnce(msg);

        return promise
            .wrap(() => fn(msg))
            .then((res) => {
                if (res instanceof Error) return res;
                return this._asserted()
                    .then((ch) =>
                        ch.publish('', replyTo, res, { correlationId }))
                    .then(() => msg.ack());
            });
    };
}

/** @this {RPCChannel} */
function makeRpc(routingKey, msg, { timeout, ...options }) {
    const { correlationId, replyTo } = options;
    return (resolve, reject) => {
        const fn = (msg) =>
            this._resp.emit(msg.properties.correlationId, msg);

        let timer, listener, tag;

        const cleanup = () => {
            this._resp.removeListener(correlationId, listener);
            clearTimeout(timer);
            return this.cancel(tag).catch(reject);
        };

        if (timeout > 0) {
            const abort = () => {
                reject(new TimeoutError(timeout));
                cleanup();
            };
            timer = setTimeout(abort, timeout);
        }

        this._resp.on(correlationId, listener = (msg) => {
            timer && clearTimeout(timer);
            errors.parse(msg)
                .then((res) => cleanup().then(() => res))
                .then(resolve, reject);
        });

        this._asserted()
            .then((ch) => this._consume(ch, replyTo, fn, { noAck: true }))
            .then(({ consumerTag }) => {
                tag = consumerTag;
                return this.publish(routingKey, msg, options);
            })
            .catch(reject);
    };
}

/**
 * @template T
 * @typedef {{ new(...args: any): T }} ConstructorOf
 */
/**
 * @param {{ uid: { generate: () => string }, timeout: number }} config
 * @return {(original: ConstructorOf<ContextChannel>) => ConstructorOf<RPCChannel>}
 * */
module.exports = function(config) {
    return (constructor) =>
        class RPCChannel extends constructor {
            constructor(ctx, fields) {
                super(ctx, fields);
                // Used to correlate rpc requests and replies
                this._resp = new EventEmitter();
            }

            rpc(routingKey, msg, { uid = config.uid, timeout = config.timeout, ...options } = {}) {
                return rpc.call(this, routingKey, msg, { uid, timeout, ...options });
            }

            consume(queue, fn, options) {
                return super.consume(queue, reply.call(this, fn), options);
            }
        };
};
