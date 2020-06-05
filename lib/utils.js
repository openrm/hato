/**
 * @template T
 * @param {(arg: T) => any} fn
 * @return {(arg: T) => Promise<T>}
 */
const tap = (fn) => (arg) => Promise
    .resolve()
    .then(() => fn(arg))
    .then(() => arg);

/**
 * @param {Error} err
 */
const fail = (err) => { throw err; };

/**
 * @typedef {import("events").EventEmitter} EventEmitter
 * @param {EventEmitter} src
 * @param {EventEmitter} dst
 */
const forward = (src, dst) =>
    /**
     * @param {string} name
     * @return {EventEmitter}
     */
    (name) => src.on(name, dst.emit.bind(dst, name));

module.exports = { tap, fail, forward };
