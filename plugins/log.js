const Plugin = require('./base');
const { Scopes: { PUBLICATION, SUBSCRIPTION } } = require('../lib/constants');

module.exports = class extends Plugin {

    constructor(log = console.log) {
        super('log');
        this.log = log;
    }

    init() {
        this.scopes[PUBLICATION] = this.onPublish();
        this.scopes[SUBSCRIPTION] = this.onConsume();
    }

    onPublish() {
        const plugin = this;
        return (publish) => (exchange, routingKey, content, options, callback) => {
            // Log with the provided function
            try {
                plugin.log({
                    action: 'publish',
                    exchange,
                    routingKey,
                    content
                });
            } catch (e) {
                plugin.logger.warn(
                    '[AMQP:log] Message logging failed with an exception.',
                    e.message,
                    'Value:',
                    content);
            }

            return publish(exchange, routingKey, content, options, callback);
        };
    }

    onConsume() {
        const plugin = this;
        return (consume) => (queue, fn, options) => {
            const handler = function(msg) {
                // Log with the provided function
                try {
                    plugin.log({
                        action: 'consume',
                        exchange: msg.fields.exchange,
                        routingKey: msg.fields.routingKey,
                        content: msg.content
                    });
                } catch (e) {
                    plugin.logger.warn(
                        '[AMQP:log] Message logging failed with an exception.',
                        e.message,
                        'Value:',
                        msg.content);
                }

                return fn(msg);
            };
            return consume(queue, handler, options);
        };
    }

};
