const asyncHooks = require('async_hooks');
const state = new Map();

const breakLoop = function(name, fn) {
    return function(...args) {
        const asyncId = asyncHooks.executionAsyncId();
        const events = state.get(asyncId) || [];
        if (!events.includes(name)) {
            state.set(asyncId, events.concat(name));
            fn(...args);
        }
    };
};

const hook = asyncHooks.createHook({
    init: (aid, type, tid) => {
        if (state.has(tid)) state.set(aid, state.get(tid));
    },
    destroy: (aid) => state.delete(aid)
});

function forwardEvents(src, dst, ...events) {
    hook.enable(); // enabled only once even if called repeatedly.
    events.forEach((name) =>
        src.on(name, breakLoop(name, dst.emit.bind(dst, name))));
    return dst;
}

function forwardAllEvents(src, dst, bidirectional = false, but = []) {
    if (bidirectional) forwardAllEvents(dst, src, false, but);
    but = but.concat('newListener', 'removeListener');
    const events = dst.eventNames().filter((name) => !but.includes(name));
    return forwardEvents(src, dst, ...events)
        .on('newListener', (eventName) => {
            if (!events.concat(but).includes(eventName)) {
                forwardEvents(src, dst, eventName);
            }
        });
}

module.exports = {
    events: {
        forward: forwardEvents,
        forwardAll: forwardAllEvents
    },
    promise: {
        /**
         * @template T
         * @param {(msg: any) => Promise<T>} fn
         * @return {Promise<T>}
         * */
        wrap: (fn) => Promise.resolve().then(fn)
    },
    expose: (src, dst, ...members) => {
        members.forEach((member) => {
            if (src[member] === undefined) return;
            if (typeof src[member] === 'function') {
                dst[member] = src[member].bind(src);
            }
            else dst[member] = src[member];
        });
        return dst;
    }
};
