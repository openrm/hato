const assert = require('assert');
const { EventEmitter } = require('events');
const { Client } = require('..');

describe('client', () => {
    it('should emit an unhandled consumer error', (done) => {
        const client = new Client();

        const thing = 'thing';
        const consumer = client
            .subscribe('some.key', () => { throw thing; })
            .then(({ consumerTag }) => {
                assert(consumerTag);
                return 'resolved';
            })
            .on('error', (err) => {
                assert.strictEqual(err, thing);
                client.close().then(() => done());
            })
            .then((text) => assert.strictEqual(text, 'resolved'))
            .catch(done);

        assert(consumer instanceof Promise);

        // check for pseudo inheritance
        const proto = EventEmitter.prototype;
        Object.getOwnPropertyNames(proto)
            .forEach((name) => {
                if (name === 'constructor') return;
                if (typeof proto[name] === 'function') {
                    assert.strictEqual(consumer[name], proto[name]);
                }
            });

        client
            .start()
            .then(() => client.publish('some.key', Buffer.from('hello')))
            .catch(done);
    });

    it('should exit on connection failure', (done) => {
        const client = new Client('amqp://invalid.host');
        client.start()
            .then(() => done(new Error('Connection must fail')))
            .catch((err) => {
                assert.strictEqual(err.cause.code, 'ENOTFOUND');
                client.close().then(() => done());
            });
    });

    it('should emit \'close\' on connection \'close\'', (done) => {
        const client = new Client();
        client
            .on('close', () => done())
            .start()
            .then(() => client.close())
            .catch(done);
    });
});
