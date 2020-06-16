const assert = require('assert');
const { Client, constants: { Scopes } } = require('..');
const ServiceContext = require('./service');

describe('service-context plugin', () => {
    const plugin = new ServiceContext({
        name: 'test-client',
        instanceId: '1234',
        namespace: 'development',
        version: '0.0.1',
        queue: {
            options: {
                durable: false,
                exclusive: true
            }
        }
    });
    it('injects specified service context into client properties', (done) => {
        const fn = function(url, options) {
            const properties = options.clientProperties;
            assert.strictEqual(properties['service.name'], 'test-client');
            assert.strictEqual(properties['service.version'], '0.0.1');
            assert.strictEqual(properties['service.instance.id'], '1234');
            assert.strictEqual(properties['service.namespace'], 'development');
            done();
        };
        plugin.enable();
        plugin.install(Scopes.CONNECTION)(fn)('', {});
    });
    it('names queues automatically in a microservices context', (done) => {
        const testQueue = {
            scopes: {
                [Scopes.CHANNEL]: (create) => () => create()
                    .then((ch) => {
                        const original = ch.assertQueue;
                        ch.assertQueue = function(name, options) {
                            assert.strictEqual(name, 'test-client:foo:amq.topic');
                            assert.strictEqual(options.durable, false);
                            assert.strictEqual(options.exclusive, true);
                            done();
                            return original.apply(this, arguments);
                        };
                        return ch;
                    })
                    .catch(done)
            },
            enable() {},
            install() {
                return this.scopes[Scopes.CHANNEL];
            }
        };
        const client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [plugin, testQueue]
        });
        client.type('topic').subscribe('foo', () => {});
        client.start().catch(done);
    });
});
