const { EventEmitter } = require('events');
const Plugin = require('./base');
const { Scopes: { CHANNEL, PUBLICATION } } = require('../lib/constants');
const { UnroutableMessageError, UndeliverableMessageError } = require('../lib/errors');

const Puid = require('puid');

module.exports = class extends Plugin {

    constructor({ uid = new Puid() } = {}) {
        super('confirm');

        this.uid = uid;
        this._failed = new EventEmitter();
    }

    init() {
        this.scopes[CHANNEL] = this.handleBounced();
        this.scopes[PUBLICATION] = this.mandate();
    }

    handleBounced() {
        const plugin = this;
        return (create) => () => create()
            .then((ch) => {
                ch.on('return', (msg) => {
                    if (msg.properties.messageId) {
                        plugin._failed.emit(msg.properties.messageId, msg);
                    }
                });
                return ch;
            });
    }

    mandate() {
        const plugin = this;
        return (publish) =>
            (ex, key, content, options, cb) => {
                const {
                    mandatory,
                    immediate,
                    messageId = plugin.uid.generate()
                } = options;
                if (mandatory || immediate) {
                    // `immediate` option is not implemented on RabbitMQ
                    const listener = (msg) => {
                        const err = mandatory ? new UnroutableMessageError(msg) :
                            new UndeliverableMessageError(msg);
                        // this works since basic.return's are sent before basic.ack's
                        // c.f. https://www.rabbitmq.com/confirms.html#when-publishes-are-confirmed
                        cb(err);
                        plugin._failed.removeListener(messageId, listener);
                    };
                    plugin._failed.on(messageId, listener);
                }
                return publish(ex, key, content, { ...options, messageId }, cb);
            };
    }

};
