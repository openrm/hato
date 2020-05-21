const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const setContext = (properties, service) => {
    const merge = (acc, [key, to]) =>
        !properties[to] && service[key] ?
            Object.assign(acc, { [to]: service[key] }) : acc;
    return Object.entries({
        'name': 'service.name',
        'version': 'service.version',
        'instanceId': 'service.instance.id',
        'namespace': 'service.namespace'
    }).reduce(merge, properties);
};

const associateContext = (resource, service) => (connect) =>
    (url, { clientProperties = {}, ...socketOptions } = {}) => {
        if (!resource) {
            clientProperties = setContext(clientProperties, service);
        }
        return connect(url, {
            clientProperties,
            ...socketOptions
        });
    };

module.exports = class ServiceContext extends Plugin {

    constructor({ resource, queue = {}, ...service } = {}) {
        super();

        this.wrappers = {
            [Scopes.CONNECTION]: () => associateContext(resource, service)
        };
    }

};
