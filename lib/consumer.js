const { EventEmitter } = require('events');

/**
 * @template T
 * @typedef {Promise<T> & EventEmitter} Consumer
 */

/**
 * @template T
 * @typedef {(resolve: (result: T) => void, reject: (reason: any) => void) => void} Executor
 */

/**
 * Apply a mixin, but using an instance as source.
 *
 * @template {function & { new(...args: any): any }} T
 * @template {function & { new(...args: any): any }} U
 * @param {T} ctor
 * @param {U} baseCtor
 * @param {InstanceType<U>} instance
 * @return {{ new(...args: any): InstanceType<T> & InstanceType<U> }}
 */
const applyMixin = function(ctor, baseCtor, instance) {
    Object.getOwnPropertyNames(baseCtor.prototype)
        .filter((name) => name !== 'constructor')
        .forEach((name) => {
            ctor.prototype[name] = instance[name];
        });
    return ctor;
}

/**
 * Create a promise with a bound event emitter.
 *
 * @template T
 * @param {(consumer: EventEmitter) => Promise<T>} fn
 * @return {Consumer<T>}
 */
module.exports.create = function(fn) {
    const Consumer = class extends Promise {}
    const emitter = new EventEmitter();
    /** @type {{ new<T>(exec: Executor<T>): Consumer<T> }} */
    const clazz = applyMixin(Consumer, EventEmitter, emitter);
    return new clazz((resolve, reject) => fn(emitter).then(resolve, reject));
};
