const connect = require('./connect');
const { Scopes } = require('./constants');

const createCancelToken = () => {
    let cancel, cancelled = new Promise((resolve) => cancel = resolve);
    return { cancel, cancelled };
};

class Client {

    constructor(options) {
        return this.constructor.init(options);
    }

    static init(options) {
        const {
            logger = console,
            plugins = []
        } = options;

        const { cancelled, cancel } = createCancelToken();

        const context = {
            logger,
            cancelled,
            cancel
        };

        this.connect = stack.call(context, connect, Scopes.CONNECTION, plugins);

        return this;
    }

}

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original.bind(this));
}

module.exports = Client;
