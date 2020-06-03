const Plugin = require('../base');
const { Scopes } = require('../../lib/constants');
const errors = require('./errors');

const Puid = require('puid');

module.exports = class RPCPlugin extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super();

        this.wrappers = {

            [Scopes.CHANNEL]: this.replyOnNack,

            [Scopes.API]: require('./api')({ uid, timeout }),

        };
    }

    replyOnNack({ logger }) {
        return (create) => () => create()
            .then((ch) => {
                const nack = ch.nack;
                ch.nack = function(msg, multiple, requeue, err) {
                    nack.call(ch, msg, multiple, requeue);

                    // not a rpc
                    if (!msg.properties.replyTo) return;
                    if (requeue || !err) return;

                    const { replyTo, correlationId } = msg.properties;

                    try {
                        const { content, options } = errors.serialize(err);
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

};
