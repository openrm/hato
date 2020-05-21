const Client = require('./lib');
const plugins = require('./plugins');

const Plugins = {
    gracefulShutdown: plugins.ConnectionRetry,
    connectionRetry: plugins.ConnectionRetry,
    reconnection: plugins.Reconnection,
    duplex: plugins.Duplex,
    encoding: plugins.Encoding,
    rpc: plugins.RPC,
    confirm: plugins.Confirm,
    retry: plugins.Retry
};

const resolvePlugins = (plugins) => plugins
    .filter(Boolean)
    .map((plugin) => {
        if (typeof plugin === 'string' && Plugins[plugin]) {
            return new Plugins[plugin]();
        } else return plugin;
    });

module.exports.connect = (url, options) => Client.start(url, {
    logger: console,
    plugins: resolvePlugins([
        'gracefulShutdown',
        'connectionRetry',
        'reconnection',
        'duplex',
        'encoding',
        'rpc',
        'confirm',
        'retry'
    ]),
    ...options
});

module.exports.Client = function(url, { plugins = [], ...options }) {
    return new Client(url, { plugins: resolvePlugins(plugins), ...options });
};

module.exports.constants = require('./lib/constants');
module.exports.errors = require('./lib/errors');
module.exports.plugins = plugins;
