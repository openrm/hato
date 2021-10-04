const Plugin = require('./base');
const { Scopes: { PUBLICATION, SUBSCRIPTION } } = require('../lib/constants');

module.exports = class extends Plugin {

    constructor(type = 'json') {
        super('encoding');
        this.type = type;
    }

    init() {
        this.scopes[SUBSCRIPTION] = this.decode();
        this.scopes[PUBLICATION] = this.encode();
    }

    decode() {
        const plugin = this;
        return (consume) => (queue, fn, options) => {
            const handler = function(msg) {
                switch (plugin.type) {
                case 'json':
                    try {
                        msg.content = JSON.parse(Buffer.from(msg.content).toString());
                    } catch (e) {
                        plugin.logger.warn(
                            '[AMQP:encoding] JSON deserialization failed with an exception.',
                            e.message,
                            'Value:',
                            msg.content,
                            'Queue:',
                            queue,
                            'Properties:',
                            msg.properties);
                    }
                    break;
                default:
                }
                return fn(msg);
            };
            return consume(queue, handler, options);
        };
    }

    encode() {
        const plugin = this;
        return (publish) => (exchange, routingKey, content, options, callback) => {
            switch (plugin.type) {
            case 'json':
                if (Buffer.isBuffer(content)) content = content.toString();
                try {
                    content = JSON.stringify(content);
                    options.contentType = 'application/json';
                } catch (e) {
                    plugin.logger.warn(
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
