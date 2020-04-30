const Client = require('./lib');
const plugins = require('./plugins');

// default plugins
const {
    Reconnection,
    GracefulShutdown,
    ConnectionRecovery
} = plugins;

// TODO(naggingant) export named constructor instead
module.exports = new Client({
    logger: console,
    plugins: [
        new Reconnection(),
        new GracefulShutdown(),
        new ConnectionRecovery()
    ]
});

module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
module.exports.plugins = plugins;
