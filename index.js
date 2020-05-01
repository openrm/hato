const Client = require('./lib');
const plugins = require('./plugins');

// default plugins
const {
    Reconnection,
    GracefulShutdown,
    Retry
} = plugins;

// TODO(naggingant) export named constructor instead
module.exports = new Client({
    logger: console,
    plugins: [
        new Retry(),
        new GracefulShutdown(),
        new Reconnection()
    ]
});

module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
module.exports.errors = require('./lib/errors');
module.exports.plugins = plugins;
