const assert = require('assert');
const sinon = require('sinon');
const { Client, constants: { Scopes } } = require('..');
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
        },
        prefetch: 1
    };

    const plugin = new DefaultOptions(defaults).enable();

    before(async function() {
        this.client = await new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [plugin]
        }).start();
    });

    after(function() {
        sinon.restore();
        return this.client.close();
    });

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
        const wrapped = plugin.install(Scopes.CHANNEL)(createChannel);
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
        const wrapped = plugin.install(Scopes.CHANNEL)(testCreate);
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

    it('should set default prefetch count', function(done) {
        sinon
            .stub(Object.getPrototypeOf(this.client._self).prototype, 'consume')
            .callsFake(function() {
                try {
                    assert.strictEqual(this._context.prefetch, defaults.prefetch);
                    done();
                } catch (err) {
                    done(err);
                }
            });

        this.client.consume('test', () => {}, { exclusive: true, durable: false });
    });
});
