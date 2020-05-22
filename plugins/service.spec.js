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
            if (options.clientProperties
                && options.clientProperties['service.name'] === 'test-client'
                && options.clientProperties['service.version'] === '0.0.1'
                && options.clientProperties['service.instance.id'] === '1234'
                && options.clientProperties['service.namespace'] === 'development') {
                done();
            } else done(new Error(`Wrong options returned: ${JSON.stringify(options)}`));
        };
        plugin.wrap(Scopes.CONNECTION)(fn)('', {});
    });
    it('names queues automatically in a microservices context', (done) => {
        const testQueue = {
            scopes: [Scopes.CHANNEL],
            wrap() {
                return (create) => () => create()
                    .then((ch) => {
                        const original = ch.assertQueue;
                        ch.assertQueue = function(name, options) {
                            if (name === 'test-client:foo:amq.topic'
                                && !options.durable && options.exclusive) {
                                done();
                            } else {
                                done(new Error('Got wrong queue attributes: name: ' + name +
                                    ' options: ' + JSON.stringify(options)));
                            }
                            return original.apply(this, arguments);
                        };
                        return ch;
                    }).catch(done);
            }
        };
        const client = new Client('amqp://guest:guest@127.0.0.1:5672', { plugins: [plugin, testQueue] });
        client.type('topic').subscribe('foo', () => {});
        client.start().catch(done);
    });
});
