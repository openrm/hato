const { promise } = require('../helpers');
const { TimeoutError } = require('../../lib/errors');
const errors = require('./errors');

/**
 * @typedef {import('../../lib/api')} ContextChannel
 *
 * @typedef {object} RPCMethods
 * @property {any} rpc
 *
 * @typedef {ContextChannel & RPCMethods} RPCChannel
 */

/** @this {RPCChannel} */
function rpc(plugin, routingKey, msg, { uid, ...options }) {
    const correlationId = uid.generate();

    const publish = prepareRpc
        .call(this, plugin, routingKey, msg, { correlationId, ...options });

    return this._asserted()
        .then(() => new Promise(publish));
}

/** @this {RPCChannel} */
function prepareRpc(plugin, routingKey, msg, { timeout, ...options }) {
    const { correlationId } = options;

    return (resolve, reject) => {
        const listener = (msg) => {
            clearTimeout(msg._timeout);
            errors.parse(msg)
                .then((res) => Promise.resolve(cleanup()).then(() => res))
                .then(resolve, reject);
        };

        const cleanup = () => {
            plugin._resp.removeListener(correlationId, listener);
            clearTimeout(msg._timeout);
        };

        if (timeout > 0) {
            const abort = () => {
                reject(new TimeoutError(timeout));
                cleanup();
            };
            msg._timeout = setTimeout(abort, timeout);
        }

        plugin._resp.on(correlationId, listener);

        const opts = { ...options, replyTo: plugin._replyTo };
        return this.publish(routingKey, msg, opts).catch(reject);
    };
}

function reply(ch, msg, err, res) {
    const {
        replyTo,
        correlationId
    } = msg.properties;

    if (msg._replied) return;
    else msg._replied = true;

    if (err) {
        const { content, options } = errors.serialize(err);
        const headers = { ...msg.properties.headers, ...options.headers };
        return ch
            .publish('', replyTo, content, { ...options, headers, correlationId });
    }

    return ch
        .publish('', replyTo, res, { correlationId });
}

/**
 * @this {RPCChannel}
 */
function consume(consume, queue, fn, options) {
    const handler = (msg) => {
        // not a rpc
        if (!msg.properties.replyTo) return fn(msg);

        msg._replied = false;

        msg.reply = (err, res) => this._asserted()
            .then(ch => reply(ch, msg, err, res))
            .then(() => msg.ack())
            .catch((err) => {
                this.logger.error(
                    '[AMQP:rpc] Failed to reply back to client.',
                    err);
            });

        return promise
            .wrap(() => fn(msg))
            .then((res) => msg.reply(null, res));
    };

    return consume
        .call(this, queue, handler, options)
        .on('error', (err, msg) =>
            typeof msg.reply === 'function' && msg.reply(err));
}

/**
 * @template T
 * @typedef {{ new(...args: any): T }} ConstructorOf
 */
/**
 * @return {(original: ConstructorOf<ContextChannel>) => ConstructorOf<RPCChannel>}
 * */
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
