//
// Imports
//

const Client = require('./lib');
const plugins = require('./plugins');


//
// Types
//

/**
 * @typedef { import("./lib").Client } Client
 * @typedef { import("./lib").Plugin } Plugin
 * @typedef { import("./lib").Options & { plugins?: (Plugin | string)[] }} Options
 */


//
// Plugins
//

/**
 * @type {{ [key: string]: { new(): Plugin } }}
 */
const Plugins = {
    gracefulShutdown: plugins.GracefulShutdown,
    connectionRetry: plugins.ConnectionRetry,
    duplex: plugins.Duplex,
    encoding: plugins.Encoding,
    rpc: plugins.RPC,
    confirm: plugins.Confirm,
    retry: plugins.Retry
};

/**
 * @param {(Plugin | string)[]} plugins
 * @return {Plugin[]}
 */
const resolvePlugins = (plugins) => plugins
    .filter(Boolean)
    .map((plugin) => {
        if (typeof plugin === 'string') {
            return new Plugins[plugin]();
        } else return plugin;
    });


//
// Exports
//

/**
 * @param {string | object} [url]
 * @param {object} [options]
 * @return {Promise<Client>}
 */
module.exports.connect = (url, options) => Client.start(url, {
    logger: console,
    plugins: resolvePlugins([
        'gracefulShutdown',
        'connectionRetry',
        'duplex',
        'encoding',
        'rpc',
        'confirm',
        'retry'
    ]),
    ...options
});

/**
 * @param {string | object} [url]
 * @param {Options} [options]
 * @return {Client}
 */
module.exports.Client = function(url, { plugins = [], ...options } = {}) {
    return Client(url, { plugins: resolvePlugins(plugins), ...options });
};

/**
 * @param {string | object} [url]
 * @param {Options} [options]
 * @return {Promise<Client>}
 */
module.exports.Client.start = function(url, { plugins = [], ...options } = {}) {
    return Client.start(url, { plugins: resolvePlugins(plugins), ...options });
};

module.exports.constants = require('./lib/constants');
module.exports.errors = require('./lib/errors');
module.exports.plugins = plugins;
