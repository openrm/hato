const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const isObject = (v) => v !== null && typeof v === 'object';

const setDefaults = (options = {}, defaults) => Object.keys(options)
    .reduce((acc, key) => {
        if (isObject(acc[key]) && isObject(options[key])) {
            return Object.assign(acc, {
                [key]: setDefaults(options[key], acc[key])
            });
        }
        return Object.assign(acc, { [key]: options[key] });
    }, { ...defaults });

const wrap = function(ch, name, pos, defaults) {
    const original = ch[name];
    ch[name] = function(...args) {
        args[pos] = setDefaults(args[pos], defaults);
        return original.apply(ch, args);
    };
};

module.exports = class DefaultOptions extends Plugin {

    constructor({
        exchange = {},
        queue = {},
        consume = {},
        publish = {},
        prefetch = 0
    } = {}) {
        super('defaults');
        this.options = { exchange, queue, consume, publish, prefetch };
    }

    init() {
        const { exchange, queue, consume, publish, prefetch } = this.options;
        this.scopes[Scopes.CHANNEL] = (create) => () =>
            create()
                .then((ch) => {
                    wrap(ch, 'assertQueue', 1, queue);
                    wrap(ch, 'assertExchange', 2, exchange);
                    wrap(ch, 'consume', 2, consume);
                    wrap(ch, 'publish', 3, publish);
                    return ch;
                });

        this.scopes[Scopes.API] = (base) => class extends base {
            consume(queue, fn, options) {
                if (prefetch > this._context.prefetch) {
                    return super.context({ prefetch }).consume(queue, fn, options);
                } else {
                    return super.consume(queue, fn, options);
                }
            }
        };
    }

};
