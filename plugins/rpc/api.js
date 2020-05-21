const { EventEmitter } = require('events');
const { promise } = require('../helpers');
const { TimeoutError } = require('../../lib/errors');
const errors = require('./errors');

function rpc(routingKey, msg, { uid, timeout, ...options }) {
    const correlationId = uid.generate();

    const rpc = makeRpc.bind(this, routingKey, msg);

    return this._asserted()
        .then((ch) => ch.assertQueue('', { exclusive: true, autoDelete: true }))
        .then(({ queue: replyTo }) =>
            new Promise(rpc({ replyTo, correlationId, timeout, ...options })));
}

function reply(fn) {
    return (msg) => {
        const {
            replyTo,
            correlationId
        } = msg.properties;

        // not a rpc
        if (!replyTo) return fn(msg);

        return promise
            .wrap(() => fn(msg))
            .then((res) => {
                if (res instanceof Error) return res;
                return this._asserted()
                    .then((ch) =>
                        ch.publish('', replyTo, res, { correlationId }))
                    .then(() => msg.ack()); // TODO(naggingant) ack only once
            });
    };
}

function makeRpc(routingKey, msg, { timeout, ...options }) {
    const { correlationId, replyTo } = options;
    return (resolve, reject) => {
        const fn = (msg) =>
            this._resp.emit(msg.properties.correlationId, msg);

        let timer, listener, tag;

        const cleanup = () => {
            this._resp.removeListener(correlationId, listener);
            clearTimeout(timer);
            this.cancel(tag);
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
            errors.parse(msg).then(resolve, reject);
            cleanup();
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

module.exports = (config) => () =>
    (constructor) => class extends constructor {
        constructor(...args) {
            super(...args);
            // used to correlate rpc requests and replies
            this._resp = new EventEmitter();
        }
        rpc(routingKey, msg, { uid = config.uid, timeout = config.timeout, ...options } = {}) {
            return rpc.call(this, routingKey, msg, { uid, timeout, ...options });
        }
        consume(queue, fn, options) {
            return super.consume(queue, reply.call(this, fn), options);
        }
    };
