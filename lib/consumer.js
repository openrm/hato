const { EventEmitter } = require('events');

/**
 * Apply a mixin, but using an instance as source.
 */
const applyMixin = function(ctor, instance) {
    Object.getOwnPropertyNames(instance.constructor.prototype)
        .filter((name) => name !== 'constructor')
        .forEach((name) => {
            ctor.prototype[name] = instance[name];
        });
    return ctor;
};

/**
 * Create a promise with a bound event emitter.
 */
module.exports.create = function(fn) {
    const Consumer = class extends Promise {};
    const emitter = new EventEmitter();
    const clazz = applyMixin(Consumer, emitter);
    return new clazz((resolve, reject) => fn(emitter).then(resolve, reject));
};
