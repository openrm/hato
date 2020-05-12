const Client = require('./lib');
const plugins = require('./plugins');

// default plugins
const {
    Reconnection,
    GracefulShutdown,
    ConnectionRetry,
    Duplex,
    Encoding
} = plugins;

// TODO(naggingant) export named constructor instead
module.exports.connect = (url, options) => Client.start(url, {
    logger: console,
    plugins: [
        new ConnectionRetry(),
        new GracefulShutdown(),
        new Reconnection(),
        new Duplex(),
        new Encoding('json')
    ],
    ...options
});

module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
module.exports.errors = require('./lib/errors');
module.exports.plugins = plugins;
