const { EventEmitter } = require('events');
const Plugin = require('./base');
const { promise } = require('./helpers');
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
                                const abort = () => {
                                    reject(new TimeoutError(timeout));
                                    this._resp.removeListener(correlationId, listener);
                                };
                                timer = setTimeout(abort, timeout);
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

                            fn = fn.bind(null, msg);

                            // not a rpc
                            if (!replyTo) return fn();

                            return promise
                                .wrap(fn)
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
