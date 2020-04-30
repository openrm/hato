const connect = require('./connect');
const { Scopes } = require('./constants');

class Client {

    constructor(options) {
        const {
            logger = console,
            plugins = []
        } = options;

        const context = {
            logger
        };

        this.connect = stack.call(context, connect, Scopes.CONNECTION, plugins);
    }

}

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original.bind(this));
}

module.exports = Client;
