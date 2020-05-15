const tap = (fn) => (arg) => Promise
    .resolve()
    .then(() => fn(arg))
    .then(() => arg);

module.exports = { tap };
