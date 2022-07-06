const tap = (fn) => (arg) => Promise
    .resolve()
    .then(() => fn(arg))
    .then(() => arg);

const fail = (err) => {
    throw err;
};

const forward = (src, dst) =>
    (name) => src.on(name, dst.emit.bind(dst, name));

module.exports = { tap, fail, forward };
