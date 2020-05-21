const { constants: { Scopes } } = require('..');
const ResourceContext = require('./resource');

describe('resource plugin', () => {
    const plugin = new ResourceContext({
        service: {
            name: 'test-client',
            instanceId: '1234',
            namespace: 'development',
            version: '0.0.1'
        }
    });
    it('injects specified service context into client properties', (done) => {
        const fn = function(url, options) {
            if (options.clientProperties
                && options.clientProperties.serviceName === 'test-client'
                && options.clientProperties.serviceVersion === '0.0.1'
                && options.clientProperties.instanceId === '1234'
                && options.clientProperties.namespace === 'development') {
                done();
            } else done(new Error(`Wrong options returned: ${JSON.stringify(options)}`));
        };
        plugin.wrap(Scopes.CONNECTION)(fn)('', {});
    });
});
