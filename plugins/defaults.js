const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const setDefaults = (options = {}, defaults) => {
    return Object.keys(options)
        .reduce((acc, key) => {
            if (acc[key] !== null &&
                options[key] !== null &&
                typeof acc[key] === 'object' &&
                typeof options[key] === 'object') {
                return Object.assign(acc, {
                    [key]: setDefaults(options[key], acc[key])
                });
            }
            return Object.assign(acc, { [key]: options[key] });
        }, { ...defaults });
};

const wrap = function(ch, name, pos, defaults) {
    const original = ch[name];
    ch[name] = function(...args) {
        args[pos] = setDefaults(args[pos], defaults);
        return original.apply(ch, args);
    };
};

module.exports = class DefaultOptions extends Plugin {

    constructor({ exchange = {}, queue = {}, consume = {}, publish = {} } = {}) {
        super();
        this.wrappers = {
            [Scopes.CHANNEL]: () => (create) => () => {
                return create()
                    .then((ch) => {
                        wrap(ch, 'assertQueue', 1, queue);
                        wrap(ch, 'assertExchange', 2, exchange);
                        wrap(ch, 'consume', 2, consume);
                        wrap(ch, 'publish', 3, publish);
                        return ch;
                    });
            }
        };
    }

};
