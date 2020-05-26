const assert = require('assert');
const { constants: { Scopes } } = require('..');
const DefaultOptions = require('./defaults');

describe('defaults plugin', () => {
    const defaults = {
        exchange: {
            durable: true,
            alternateExchange: 'altx'
        },
        queue: {
            durable: true,
            messageTtl: 1 << 16,
            arguments: {
                'x-dummy': 15
            }
        },
        consume: {
            noAck: true,
            consumerTag: 'consumer0'
        },
        publish: {
            persistent: true,
            mandatory: true,
            headers: {
                'x-custom': true
            }
        }
    };

    const plugin = new DefaultOptions(defaults);

    const createChannel = (defs = defaults) => Promise.resolve({
        assertQueue(queue, options) {
            assert.deepStrictEqual(defs.queue, options);
        },
        assertExchange(exchange, type, options) {
            assert.deepStrictEqual(defs.exchange, options);
        },
        consume(queue, fn, options) {
            assert.deepStrictEqual(defs.consume, options);
        },
        publish(exchange, routingKey, content, options) {
            assert.deepStrictEqual(defs.publish, options);
        }
    });

    it('should ensure default options', (done) => {
        const wrapped = plugin.wrap(Scopes.CHANNEL)(createChannel);
        wrapped()
            .then((ch) => {
                ch.assertQueue('a.queue');
                ch.assertExchange('an.exchange', 'topic');
                ch.consume('a.queue', () => {});
                ch.publish('', 'a.routing.key', Buffer.from('a'));
                done();
            })
            .catch(done);
    });

    it('respect privided options', (done) => {
        const testCreate = () => createChannel({
            ...defaults,
            queue: {
                durable: false,
                exclusive: true,
                messageTtl: 1 << 16,
                arguments: {
                    'x-dummy': 'modified',
                    'x-another': true
                }
            }
        });
        const wrapped = plugin.wrap(Scopes.CHANNEL)(testCreate);
        wrapped()
            .then((ch) => {
                ch.assertQueue('a.queue', {
                    durable: false,
                    exclusive: true,
                    arguments: {
                        'x-dummy': 'modified',
                        'x-another': true
                    }
                });
                done();
            })
            .catch(done);
    });
});
