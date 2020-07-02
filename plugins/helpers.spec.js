const assert = require('assert');
const sinon = require('sinon');
const { EventEmitter } = require('events');
const helpers = require('./helpers');

describe('helpers', () => {
    afterEach(() => sinon.restore());

    describe('event forwarding', () => {
        const events = helpers.events;
        it('should forward events from one emitter to another', (done) => {
            const a = new EventEmitter(), b = new EventEmitter();
            events.forward(a, b, 'check');
            b.on('check', (event) => {
                assert.strictEqual(event, 'an arg');
                done();
            });
            a.emit('check', 'an arg');
        });

        it('should forward all existing & new events', () => {
            const a = new EventEmitter(),
                b = new EventEmitter();

            const handler = sinon.fake();

            b.on('existingEvent', handler);
            events.forwardAll(a, b);
            b.on('newEvent', handler);

            a.emit('existingEvent', 'event 1');
            assert(handler.calledOnce);
            assert.strictEqual(handler.args[0][0], 'event 1');

            a.emit('newEvent', 'event 2');
            assert(handler.calledTwice);
            assert.strictEqual(handler.args[1][0], 'event 2');
        });

        it('should not create an infinite loop', () => {
            const a = new EventEmitter(),
                b = new EventEmitter(),
                handler = sinon.fake();

            events.forwardAll(a, b, true);

            a.once('check', handler);
            b.once('check', handler);

            a.emit('check');

            assert.strictEqual(handler.callCount, 2);
        });

        it('should scope the loop breakers by emitters', async() => {
            const a = new EventEmitter(), b = new EventEmitter(),
                c = new EventEmitter(), d = new EventEmitter();

            const aSpy = sinon.spy(), bSpy = sinon.spy(),
                cSpy = sinon.spy(), dSpy = sinon.spy();

            events.forwardAll(a, b, true);
            events.forwardAll(c, d, true);

            await new Promise((done) => {
                d.on('check', done);

                a.on('check', aSpy);
                b.on('check', bSpy);
                c.on('check', cSpy);
                d.on('check', dSpy);

                a.on('check', () => setImmediate(() => d.emit('check')));

                b.emit('check');
            });

            assert(aSpy.calledOnce);
            assert(bSpy.calledOnce);
            assert(cSpy.calledOnce);
            assert(dSpy.calledOnce);

            assert(aSpy.calledImmediatelyBefore(bSpy));
            assert(bSpy.calledImmediatelyBefore(cSpy));
            assert(cSpy.calledImmediatelyBefore(dSpy));
        });
    });
});
