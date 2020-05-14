const { EventEmitter } = require('events');
const Plugin = require('./base');
const { promise } = require('./helpers');
const { Scopes } = require('../lib/constants');
const { TimeoutError, MessageError } = require('../lib/errors');

const Puid = require('puid');

const Keys = {
    originalHeaders: 'x-rpc-original-headers',
    error: 'x-rpc-error'
};

const serialize = (err) => {
    const headers = { 'x-error': true };
    if (err instanceof MessageError) {
        const { properties: props } = err.msg;
        const originalHeaders = props.headers[Keys.originalHeaders] || props.headers;
        return {
            content: Buffer.from(JSON.stringify(err.message)),
            options: {
                ...props,
                headers: {
                    ...headers,
                    [Keys.originalHeaders]: originalHeaders,
                    [Keys.error]: true
                },
                contentType: 'application/json'
            }
        };
    }
    return {
        content: Buffer.from(JSON.stringify(err.toString())),
        options: { headers, contentType: 'application/json' }
    };
};

const parse = (msg) => {
    return new Promise((resolve, reject) => {
        const { properties: { headers } } = msg;
        if (headers['x-error']) {
            const deserialized = JSON.parse(msg.content.toString());
            reject(new MessageError(deserialized, msg));
        }
        else resolve(msg);
    });
};

function makeRpc(routingKey, msg, { timeout, ...options }) {
    const { correlationId, replyTo } = options;
    return (resolve, reject) => {
        const fn = (msg) =>
            this._resp.emit(msg.properties.correlationId, msg);

        let timer, listener;

        if (timeout > 0) {
            const abort = () => {
                reject(new TimeoutError(timeout));
                this._resp.removeListener(correlationId, listener);
            };
            timer = setTimeout(abort, timeout);
        }

        this._resp.on(correlationId, listener = (msg) => {
            timer && clearTimeout(timer);
            parse(msg).then(resolve, reject);
            this._resp.removeListener(correlationId, listener);
        });

        this._asserted()
            .then((ch) => this._consume(ch, replyTo, fn, { noAck: true }))
            .then(() => this.publish(routingKey, msg, options))
            .catch(reject);
    };
}

module.exports = class extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super();

        this.uid = uid, this.timeout = timeout;

        this.wrappers = {

            [Scopes.CHANNEL]: this.replyOnNack,

            [Scopes.API]: this.extendInterface.bind(this),

        };
    }

    replyOnNack({ logger }) {
        return (create) => () => create()
            .then((ch) => {
                const nack = ch.nack;
                ch.nack = function(msg, multiple, requeue, err) {
                    nack.apply(ch, arguments);

                    // not a rpc
                    if (!msg.properties.replyTo) return;
                    if (requeue || !err) return;

                    const { replyTo, correlationId } = msg.properties;

                    try {
                        const { content, options } = serialize(err);
                        const headers = { ...msg.properties.headers, ...options.headers };
                        ch.publish(
                            '', replyTo, content, { ...options, headers, correlationId });
                    } catch (err) {
                        logger.error(
                            '[AMQP:rpc] Failed to report the error back to client.',
                            err);
                    }
                };
                return ch;
            });
    }

    extendInterface() {
        const plugin = this;

        return (constructor) => class extends constructor {
            constructor(...args) {
                super(...args);
                // used to correlate rpc requests and replies
                this._resp = new EventEmitter();
            }
            rpc(routingKey, msg, { uid = plugin.uid, timeout = plugin.timeout, ...options } = {}) {
                return plugin.rpc.call(this, routingKey, msg, { uid, timeout, ...options });
            }
            consume(queue, fn, options) {
                return super.consume(queue, plugin.reply.call(this, fn), options);
            }
        };
    }

    rpc(routingKey, msg, { uid, timeout, ...options }) {
        const correlationId = uid.generate();

        const rpc = makeRpc.bind(this, routingKey, msg);

        return this._asserted()
            .then((ch) => ch.assertQueue('', { exclusive: true, autoDelete: true }))
            .then(({ queue: replyTo }) =>
                new Promise(rpc({ replyTo, correlationId, timeout, ...options })));
    }

    reply(fn) {
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
                    return this.publish(replyTo, res, { correlationId });
                });
        };
    }

};
