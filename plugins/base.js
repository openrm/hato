// eslint-disable-next-line
const ContextChannel = require('../lib/api');

/**
 * @typedef {import('../lib/types').Logger} Logger
 * @typedef {import('../lib/client').Connection} Connection
 * @typedef {import('../lib/client').Channel & import('../lib/client').ConfirmChannel} Channel
 */
/**
 * @template T
 * @typedef {(original: T) => T} Wrapper
 */
/**
 * @typedef {{
 *   ['connection']?: Wrapper<(...args: import('../lib/client').ConnectParams) => Promise<Connection>>,
 *   ['channel']?: Wrapper<(...args: import('../lib/client').CreateChannelParams) => Promise<Channel>>,
 *   ['publication']?: Wrapper<(...args: import('../lib/client').PublishParams) => ReturnType<Channel['publish']>>,
 *   ['subscription']?: Wrapper<(...args: import('../lib/client').SubscribeParams) => ReturnType<Channel['consume']>>,
 *   ['api']?: Wrapper<{ new(...args: any): ContextChannel }>
 * }} PatchRegistry
 */
/**
 * @typedef {{
 *   ['connection']?: (conn: Connection) => void
 * }} HookRegistry
 */

module.exports = class Plugin {

    /**
     * @param {string} [name]
     */
    constructor(name) {
        /** @readonly */
        this.pluginName = name;
        /** @type {PatchRegistry} */
        this.scopes = {};
        /** @type {HookRegistry} */
        this.hooks = {};
        /** @type {Logger} */
        this.logger = console;
    }

    /**
     * @param {Logger} logger
     */
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
