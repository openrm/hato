/**
 * @template T
 * @param {(arg: T) => any} fn
 * @return {(arg: T) => Promise<T>}
 */
const tap = (fn) => (arg) => Promise
    .resolve()
    .then(() => fn(arg))
    .then(() => arg);

module.exports = { tap };
