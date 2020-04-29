const connect = require('./connect');
const logger = require('./logger');
const { Scopes } = require('./constants');

class Client {

    constructor(options) {
        const {
            plugins
        } = options;

        this.connect = wrap(connect, Scopes.CONNECTION, plugins);
    }

}

function wrap(original, scope, plugins = []) {
    const context = {
        logger
    };
    plugins = plugins.filter((plugin) => plugin.scopes.includes(scope));
    return plugins
        .reduce((orig, plugin) => plugin.wrap(scope, context)(orig), original);
}

module.exports = Client;
