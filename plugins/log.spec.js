const assert = require('assert');
const EventEmitter = require('events');

const { Client } = require('..');
const Encoding = require('./encoding');
const Log = require('./log');

describe('log plugin', () => {
    let client;
    let emitter;

    beforeEach(async() => {
        emitter = new EventEmitter();

        const logger = (data) => {
            emitter.emit('log', data);
        };

        client = await new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [new Encoding('json'), new Log(logger)]
        })
            .start();
    });

    afterEach(() => client.close());

    describe('publishes', () => {
        it('it should log messages published to a direct exchange', (done) => {
            // Ensure logged data is as expected
            const check = (data) => {
                assert.deepStrictEqual(data.content, { string: 'string' });
                assert.strictEqual(data.routingKey, 'a.routing.key');
                assert.strictEqual(data.exchange, 'amq.direct');
                assert.strictEqual(data.action, 'publish');
                done();
            };

            // Message is logged twice, once when published, once when consumed and acknowledged
            emitter.once('log', check);

            // Subscribe and acknowledge message
            client
                .queue('foo', { durable: false, exclusive: true })
                .subscribe('a.routing.key', (msg) => msg.ack())
                .on('error', done);

            // Publish message
            client
                .type('direct')
                .publish('a.routing.key', { string: 'string' })
                .catch(done);
        });

        it('it should log messages published to a topic exchange', (done) => {
            // Ensure logged data is as expected
            const check = (data) => {
                assert.deepStrictEqual(data.content, { string: 'string' });
                assert.strictEqual(data.routingKey, 'a.routing.key');
                assert.strictEqual(data.exchange, 'amq.topic');
                assert.strictEqual(data.action, 'publish');
                done();
            };

            // Message is logged twice, once when published, once when consumed and acknowledged
            emitter.once('log', check);

            // Subscribe and acknowledge message
            client
                .queue('foo', { durable: false, exclusive: true })
                .subscribe('a.routing.key', (msg) => msg.ack())
                .on('error', done);

            // Publish message
            client
                .type('topic')
                .publish('a.routing.key', { string: 'string' })
                .catch(done);
        });
    });

    describe('consumption', () => {
        it('it should log messages consumed', (done) => {
            // Ensure logged data is as expected
            const check = (data) => {
                assert.deepStrictEqual(data.content, { string: 'string' });
                assert.strictEqual(data.routingKey, 'a.routing.key');
                assert.strictEqual(data.exchange, 'amq.topic');
                assert.strictEqual(data.action, 'consume');
                done();
            };

            // Check the message when it is logged
            emitter.on('log', (data) => {
                if (data.action === 'consume') check(data);
            });

            // Subscribe and acknowledge message
            client
                .type('topic')
                .queue('foo', { durable: false, exclusive: true })
                .subscribe('a.routing.key', (msg) => {
                    msg.ack();
                })
                .on('error', done);

            // Publish message
            client
                .type('topic')
                .publish('a.routing.key', { string: 'string' })
                .catch(done);
        });
    });
});
