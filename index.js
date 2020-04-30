const Client = require('./lib');
const plugins = require('./plugins');

// default plugins
const {
    Reconnection,
    GracefulShutdown
} = plugins;

// TODO(naggingant) export named constructor instead
module.exports = new Client({
    plugins: [
        new Reconnection(),
        new GracefulShutdown()
    ]
});

module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
module.exports.plugins = plugins;
