const Client = require('./lib');

// default plugins
const {
    Reconnection,
    GracefulShutdown
} = require('./plugins');

const client = new Client({
    plugins: [
        new Reconnection(),
        new GracefulShutdown()
    ]
});

module.exports = client;
module.exports.Client = Client;
module.exports.constants = require('./lib/constants');
