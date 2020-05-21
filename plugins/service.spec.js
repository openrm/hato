const { constants: { Scopes } } = require('..');
const ServiceContext = require('./service');

describe('service-context plugin', () => {
    const plugin = new ServiceContext({
        name: 'test-client',
        instanceId: '1234',
        namespace: 'development',
        version: '0.0.1'
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
});
