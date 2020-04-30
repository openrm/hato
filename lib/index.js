const connect = require('./connect');
const logger = require('./logger');
const { Scopes } = require('./constants');

class Client {

    constructor(options) {
        const {
            plugins
        } = options;

        this.connect = stack(connect, Scopes.CONNECTION, plugins);
    }

}

function stack(original, scope, plugins = []) {
    const context = {
        logger
    };
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, context)(next), original);
}

module.exports = Client;
