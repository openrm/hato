const Plugin = require('./base');
const { Scopes: { PUBLICATION, SUBSCRIPTION } } = require('../lib/constants');

module.exports = class extends Plugin {
    constructor(type = 'json') {
        super();
        this.type = type;
        this.wrappers = {
            [SUBSCRIPTION]({ logger }) {
                return (consume) => (queue, fn, options) => {
                    const handler = function(msg) {
                        switch (type) {
                        case 'json':
                            try {
                                msg.content = JSON.parse(Buffer.from(msg.content).toString());
                            } catch (e) {
                                logger.warn(
                                    '[AMQP:encoding] JSON deserialization failed with an exception.',
                                    e.message,
                                    'Value:',
                                    msg.content);
                            }
                            break;
                        default:
                        }
                        return fn(msg);
                    };
                    return consume(queue, handler, options);
                };
            },
            [PUBLICATION]({ logger }) {
                return (publish) => (exchange, routingKey, content, options, callback) => {
                    if (Buffer.isBuffer(content)) return content;
                    switch (type) {
                    case 'json':
                        try {
                            content = JSON.stringify(content);
                            options.contentType = 'application/json';
                        } catch (e) {
                            logger.warn(
                                '[AMQP:encoding] JSON serialization failed with an exception.',
                                e.message);
                        }
                        break;
                    default:
                    }
                    content = Buffer.from(content);
                    return publish(exchange, routingKey, content, options, callback);
                };
            }
        };
    }
};
