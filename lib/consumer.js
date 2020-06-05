const { EventEmitter } = require('events');

/**
 * @template T
 * @typedef {Promise<T> & EventEmitter} IConsumer
 */

/**
 * @template T
 * @typedef {(resolve: (result: T) => void, reject: (reason: any) => void) => void} Executor
 */

/**
 * @type {Omit<typeof Promise, 'prototype'> & {
 *   new<T>(executor: Executor<T>): IConsumer<T>
 * }} ConsumerConstructor
 * @template T
 * @param {Executor<T>} executor
 */
const Consumer = module.exports = function Consumer(executor) {
    /** @type {{ [name: string]: any }} */
    const emitter = new EventEmitter();
    const clazz = function() {};
    clazz.prototype = Object.create(Consumer.prototype);
    Object.getOwnPropertyNames(EventEmitter.prototype)
        .filter((name) => name !== 'constructor')
        .forEach((name) => {
            clazz.prototype[name] = emitter[name];
        });
    return Reflect.construct(Promise, [executor], clazz);
};

Object.setPrototypeOf(Consumer, Promise);
Consumer.prototype = Object.create(Promise.prototype);
Consumer.prototype.constructor = Consumer;
