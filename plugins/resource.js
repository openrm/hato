const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const setServiceContext = (properties, service) => {
    return Object.entries({
        'name': 'serviceName',
        'version': 'serviceVersion',
        'instanceId': 'instanceId',
        'namespace': 'namespace'
    })
        .reduce((acc, [key, to]) => !properties[to] && service[key] ?
            Object.assign(acc, { [to]: service[key] }) : acc,
        properties);
};

module.exports = class Microservice extends Plugin {

    constructor({ resource, service } = {}) {
        super();
        const associateServiceContext = (connect) =>
            (url, { clientProperties = {}, ...socketOptions } = {}) => {
                if (!resource) {
                    clientProperties = setServiceContext(clientProperties, service);
                }
                return connect(url, {
                    clientProperties,
                    ...socketOptions
                });
            };
        this.wrappers = {
            [Scopes.CONNECTION]: () => associateServiceContext
        };
    }

};
