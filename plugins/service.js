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

const associateContext = (service) => (connect) =>
    (url, { clientProperties = {}, ...socketOptions } = {}) => connect(url, {
        clientProperties: setContext(clientProperties, service),
        ...socketOptions
    });

const serializeHeaders = (headers) => Object
    .entries(headers)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');

const queueName = (binding, exchange, service) => {
    let name = `${service.name}:`;

    if (typeof binding === 'string') name += binding;
    else if (typeof binding === 'object') {
        // exchange of `headers` type
        name += serializeHeaders(binding || {});
    }

    return name += exchange ? `:${exchange}` : '';
};

module.exports = class ServiceContext extends Plugin {

    /**
     * @typedef {object} ServiceContextConfig
     * @property {{ options?: object }=} queue
     * @property {string=} name
     * @property {string=} version
     * @property {string=} instanceId
     * @property {string=} namespace
     */
    /** @param {ServiceContextConfig} config */
    constructor({ queue = {}, ...service } = {}) {
        super();

        const defaultOptions = queue.options;
        this.wrappers = {
            [Scopes.CONNECTION]: () => associateContext(service),
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
