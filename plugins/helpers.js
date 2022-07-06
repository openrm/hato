const asyncHooks = require('async_hooks');

const state = new Map();
const loopSymbol = Symbol();

const breakLoop = function(src, dst, name) {
    return Object.assign(function(...args) {
        const asyncId = asyncHooks.executionAsyncId();
        const wmap = state.get(asyncId) || new WeakMap();
        const events = wmap.get(dst) || [];
        if (events.includes(name)) return;
        else events.push(name);
        state.set(asyncId, wmap.set(src, events).set(dst, events));
        dst.emit(name, ...args);
    }, {
        [loopSymbol]: true
    });
};

const hook = asyncHooks.createHook({
    init: (aid, _, tid) => {
        if (state.has(tid)) state.set(aid, state.get(tid));
    },
    destroy: (aid) => state.delete(aid)
});

function forwardEvents(src, dst, ...events) {
    hook.enable(); // enabled only once even if called repeatedly.
    events.forEach((name) => {
        src.on(name, breakLoop(src, dst, name));
    });
    return dst;
}

function forwardAllEvents(src, dst, bidirectional = false, but = []) {
    if (bidirectional) forwardAllEvents(dst, src, false, but);
    but = but.concat('newListener', 'removeListener');
    const events = dst.eventNames().filter((name) => !but.includes(name));
    return forwardEvents(src, dst, ...events)
        .on('newListener', (eventName, listener) => {
            if (!listener[loopSymbol]
                && !events.concat(but).includes(eventName)) {
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
        wrap: (fn) => Promise.resolve().then(fn)
    },
    expose: (src, dst, ...members) => {
        members.forEach((member) => {
            if (src[member] === undefined) return;
            if (typeof src[member] === 'function') {
                dst[member] = src[member].bind(src);
            } else dst[member] = src[member];
        });
        return dst;
    }
};
