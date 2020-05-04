const connect = require('./connect');
const { Scopes } = require('./constants');

const createSubject = () => {
    let broadcast, subscribe = new Promise((resolve) => broadcast = resolve);
    return { broadcast, subscribe };
};

class Client {

    constructor(url, options = {}) {
        const {
            logger = console,
            plugins = [],
            ...opts
        } = options;

        const { subscribe: cancelled, broadcast: cancel } = createSubject();

        const context = {
            logger,
            cancelled,
            cancel
        };

        this.factories = {
            connection: () => stack.call(context, connect.bind(context, url, opts), Scopes.CONNECTION, plugins),
            channel: (conn) => stack.call(context, conn.createConfirmChannel.bind(conn), Scopes.CHANNEL, plugins)
        };

        const { subscribe: connected, broadcast: ready } = createSubject();

        this.connected = connected, this.ready = ready;
    }

    static start(url, options = {}) {
        const client = new Client(url, options);
        return client.start();
    }

    start() {
        const ready = this.ready;

        this.connect = this.factories.connection();
        this.conn = this.connect().finally(ready);

        this.createChannel = () => this.conn.then((conn) => this.factories.channel(conn)());
        this.ch = this.createChannel();

        return this;
    }

}

function stack(original, scope, plugins = []) {
    return plugins
        .filter((plugin) => plugin.scopes.includes(scope))
        .reduce((next, plugin) => plugin.wrap(scope, this)(next), original);
}

module.exports = Client;
