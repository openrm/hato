// eslint-disable-next-line
const ContextChannel = require('../lib/api');

module.exports = class Plugin {

    constructor(name) {
        this.pluginName = name;
        this.scopes = {};
        this.hooks = {};
        this.logger = console;
    }

    enable(logger) {
        if (logger) this.logger = logger;
        this.init();
        return this;
    }

    init() {}

    install(scope) {
        if (typeof this.scopes[scope] === 'function') {
            return this.scopes[scope];
        }
        throw new Error(`Plugin not implemented for scope '${scope}'`);
    }

    destroy() {}

};
