const { EventEmitter } = require('events');
const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const Puid = require('puid');

module.exports = class extends Plugin {

    constructor({ uid = new Puid() } = {}) {
        super();

        this.wrappers = {

            [Scopes.API]() {

                return (constructor) => class extends constructor {

                    constructor(...args) {
                        super(...args);
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
                            this._resp.on(correlationId, resolve);
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
