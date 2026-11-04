const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { tlsFromEnv, withTlsFromEnv } = require('./tls');

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('tlsFromEnv', () => {
    let dir;
    before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hato-tls-')); });
    after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('is empty without the variables', () => {
        assert.deepStrictEqual(tlsFromEnv({}), {});
        assert.deepStrictEqual(tlsFromEnv({ RABBITMQ_SSL_CA: '  ' }), {});
    });

    it('takes a PEM as it is', () => {
        assert.deepStrictEqual(tlsFromEnv({ RABBITMQ_SSL_CA: PEM }), { ca: PEM });
    });

    it('reads a file', () => {
        const file = path.join(dir, 'ca.crt');
        fs.writeFileSync(file, PEM);
        assert.strictEqual(tlsFromEnv({ RABBITMQ_SSL_CA: file }).ca.toString(), PEM);
    });

    it('names the variable when the file is missing', () => {
        assert.throws(() => tlsFromEnv({ RABBITMQ_SSL_CA: path.join(dir, 'nope.crt') }), /RABBITMQ_SSL_CA is neither a PEM nor a readable file/);
    });

    it('needs the certificate and the key together', () => {
        assert.throws(() => tlsFromEnv({ RABBITMQ_SSL_CERT: PEM }), /go together/);
        assert.throws(() => tlsFromEnv({ RABBITMQ_SSL_KEY: PEM }), /go together/);
        assert.deepStrictEqual(tlsFromEnv({ RABBITMQ_SSL_CERT: PEM, RABBITMQ_SSL_KEY: PEM }), { cert: PEM, key: PEM });
    });
});

describe('withTlsFromEnv', () => {
    const logger = () => { const l = { warned: [], warn: (m) => l.warned.push(m) }; return l; };

    it('returns the options untouched, and says nothing, without the variables', () => {
        const opts = { heartbeat: 5 };
        const l = logger();
        assert.strictEqual(withTlsFromEnv('amqp://x', opts, l, {}), opts);
        assert.deepStrictEqual(l.warned, []);
    });

    it('lets the caller win', () => {
        const l = logger();
        const got = withTlsFromEnv('amqps://x', { ca: 'mine', heartbeat: 5 }, l, { RABBITMQ_SSL_CA: PEM });
        assert.deepStrictEqual(got, { ca: 'mine', heartbeat: 5 });
        assert.deepStrictEqual(l.warned, []);
    });

    it('warns once when a url is not amqps', () => {
        const l = logger();
        withTlsFromEnv(['amqps://a', 'amqp://b'], {}, l, { RABBITMQ_SSL_CA: PEM });
        assert.strictEqual(l.warned.length, 1);
        assert.match(l.warned[0], /not encrypted/);
    });
});
