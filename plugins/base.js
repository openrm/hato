module.exports = class Plugin {

    wrappers = {};

    get scopes() {
        return Object.keys(this.wrappers);
    }

    wrap(scope, context) {
        if (this.wrappers && typeof this.wrappers[scope] === 'function') {
            return this.wrappers[scope](context);
        }
        else throw new Error(`Plugin not implemented for scope '${scope}'`);
    }

}
