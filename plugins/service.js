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

const queueName = (binding, exchange, service) => {
    let name = `${service.name}:`;

    if (typeof binding === 'string') name += binding;
    else name += JSON.stringify(binding || null);

    return name += exchange ? `:${exchange}` : '';
};

module.exports = class ServiceContext extends Plugin {

    constructor({ resource, queue = {}, ...service } = {}) {
        super();

        const defaultOptions = queue.options;
        this.wrappers = {
            [Scopes.CONNECTION]: () => associateContext(resource, service),
            [Scopes.API]: () => (base) => class extends base {
                consume(binding, fn, options) {
                    const { queue, exchange } = this._validateContext();
                    if (queue) return super.consume.apply(this, arguments);
                    return this
                        .queue(queueName(binding, exchange, service), {
                            durable: true,
                            ...defaultOptions
                        })
                        .consume(binding, fn, options);
                }
            }
        };
    }

};
