const { EventEmitter } = require('events');
const Plugin = require('./base');
const { Scopes } = require('../lib/constants');
const { TimeoutError } = require('../lib/errors');

const Puid = require('puid');

module.exports = class extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super();

        this.wrappers = {

            [Scopes.API]() {

                return (constructor) => class extends constructor {

                    constructor(...args) {
                        super(...args);
                        // used to correlate rpc requests and replies
                        this._resp = new EventEmitter();
                    }

                    rpc(routingKey, msg, options = {}) {
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
                                timer = setTimeout(
                                    () => reject(new TimeoutError(timeout)),
                                    timeout);
                            }

                            this._resp.on(correlationId, listener = (msg) => {
                                timer && clearTimeout(timer);
                                resolve(msg);
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

                            const res = fn(msg);

                            // not a rpc
                            if (!replyTo) return res;

                            return Promise.resolve(res)
                                .then((res) => {
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
