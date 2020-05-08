const Client = require('./lib');
const plugins = require('./plugins');

// default plugins
const {
    Reconnection,
    GracefulShutdown,
    Retry,
    Duplex
} = plugins;

// TODO(naggingant) export named constructor instead
module.exports.connect = (url, options) => Client.start(url, {
    logger: console,
    plugins: [
        new Retry(),
        new GracefulShutdown(),
        new Reconnection(),
        new Duplex()
    ],
    ...options
});

module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
module.exports.errors = require('./lib/errors');
module.exports.plugins = plugins;
