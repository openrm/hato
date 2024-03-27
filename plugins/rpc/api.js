const util = require('util');
const { promise } = require('../helpers');
const { MessageError, TimeoutError } = require('../../lib/errors');
const { symbolRetried } = require('../retry/errors');
const errors = require('./errors');

const symbolReplied = Symbol.for('hato.rpc.replied');

function rpc(plugin, routingKey, msg, { timeout = 0, uid, ...options }) {
    let listener, timer;
    const correlationId = uid.generate();
    return this._asserted()
        .then(() => {
            const promises = [
                new Promise((resolve, reject) => {
                    const msgErr = MessageError.blank();
                    plugin._resp.on(
                        correlationId,
                        listener = (msg) =>
                            errors.isError(msg) ?
                                reject(msgErr.setMessage(msg)) : resolve(msg));
                    return this.publish(
                        routingKey,
                        msg,
                        { ...options, correlationId, replyTo: plugin._replyTo })
                        .catch(reject);
                })
            ];
            if (timeout > 0) {
                const timeoutErr = new TimeoutError(timeout);
                promises.push(new Promise((_, reject) =>
                    timer = setTimeout(() => reject(timeoutErr), timeout)));
            }
            return Promise.race(promises)
                .finally(() => {
                    clearTimeout(timer);
                    plugin._resp.off(correlationId, listener);
                });
        });
}

function reply(ch, msg, err, res, options) {
    const {
        replyTo,
        correlationId
    } = msg.properties;

    if (msg[symbolReplied]) return;
    else msg[symbolReplied] = true;

    const publish = typeof ch.waitForConfirms === 'function' ?
        util.promisify(ch.publish).bind(ch) : ch.publish.bind(ch);

    if (err) {
        const { content, options: errOptions } = errors.serialize(err);
        const headers = { ...msg.properties.headers, ...errOptions.headers };
        return publish(
            '', replyTo, content, { ...options, ...errOptions, headers, correlationId });
    }

    return publish('', replyTo, res, { ...options, correlationId });
}

function consume(consume, queue, fn, options) {
    const handler = (msg) => {
        // not a rpc
        if (!msg.properties.replyTo) return fn(msg);

        msg[symbolReplied] = false;

        Object.defineProperty(msg, 'reply', {
            writable: false,
            value: (err, res, opts) => this._asserted()
                .then((ch) => reply(ch, msg, err, res, opts))
                .then(() => msg.ack())
                .catch((err) => {
                    this.logger.error(
                        '[AMQP:rpc] Failed to reply back to client.',
                        err);
                })
        });

        return promise
            .wrap(() => fn(msg))
            .then((res) => msg.reply(null, res));
    };

    return consume
        .call(this, queue, handler, options)
        .on('error', (err, msg) => {
            if (typeof msg.reply === 'function' && !err[symbolRetried]) {
                msg.reply(err);
            }
        });
}

module.exports = function(plugin) {
    const config = plugin.options;
    return (constructor) =>
        class RPCChannel extends constructor {
            constructor(ctx, fields) {
                super(ctx, fields);

                if (!plugin._configured) {
                    const handler= (msg) =>
                        plugin._resp.emit(msg.properties.correlationId, msg);

                    const handleReplies = (ch) =>
                        this._consume(ch, plugin._replyTo, handler, { noAck: true });

                    plugin._configured = this._assert((ch) => ch.then(handleReplies));
                }
            }

            rpc(routingKey, msg, { uid = config.uid, timeout = config.timeout, ...options } = {}) {
                return rpc.call(this, plugin, routingKey, msg, { uid, timeout, ...options });
            }

            consume(queue, fn, options) {
                return consume.call(this, super.consume, queue, fn, options);
            }
        };
};
