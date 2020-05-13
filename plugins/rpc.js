const { EventEmitter } = require('events');
const Plugin = require('./base');
const { promise } = require('./helpers');
const { Scopes } = require('../lib/constants');
const { TimeoutError } = require('../lib/errors');

const Puid = require('puid');

const parse = (msg) => {
    return new Promise((resolve, reject) => {
        const { properties: { headers } } = msg;
        if (headers['x-error']) {
            const deserialized = JSON.parse(msg.content.toString());
            reject(new Error(deserialized));
        }
        else resolve(msg);
    });
};

module.exports = class extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super();

        const globalTimeout = timeout;

        this.wrappers = {

            [Scopes.CHANNEL]({ logger }) {
                return (create) => () => {
                    return create().then((ch) => {
                        const nack = ch.nack;
                        ch.nack = function(msg, multiple, requeue, err) {
                            nack.apply(ch, arguments);
                            if (requeue || !err) return;
                            const serialized = Buffer.from(JSON.stringify(err));
                            const { replyTo, ...properties } = msg.properties;
                            const options = {
                                ...properties,
                                headers: {
                                    ...properties.headers,
                                    'x-error': true
                                }
                            };
                            try {
                                ch.publish('', replyTo, serialized, options);
                            } catch (err) {
                                logger.error(
                                    '[AMQP:rpc] Failed to report the error back to client.',
                                    err);
                            }
                        };
                        return ch;
                    });
                };
            },

            [Scopes.API]() {

                return (constructor) => class extends constructor {

                    constructor(...args) {
                        super(...args);
                        // used to correlate rpc requests and replies
                        this._resp = new EventEmitter();
                    }

                    rpc(routingKey, msg, { timeout = globalTimeout, ...options } = {}) {
                        const correlationId = uid.generate();
                        const replyTo = 'amq.rabbitmq.reply-to';

                        options = {
                            ...options,
                            correlationId,
                            replyTo
                        };

                        const fn = (msg) =>
                            this._resp.emit(msg.properties.correlationId, msg);

                        return new Promise((resolve, reject) => {
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

                            this.consume(replyTo, fn, { noAck: true })
                                .then(() => this.publish(routingKey, msg, options))
                                .catch(reject);
                        });
                    }

                    consume(queue, fn, options) {
                        const reply = (fn) => (msg) => {
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

                        return super.consume(queue, reply(fn), options);
                    }

                };

            }

        };
    }

};
