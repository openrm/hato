//
// TLS settings from the environment
//

const fs = require('fs');

const VARIABLES = {
    ca: 'RABBITMQ_SSL_CA',
    cert: 'RABBITMQ_SSL_CERT',
    key: 'RABBITMQ_SSL_KEY'
};

/**
 * A PEM, or the path of a file that holds one.
 */
const read = (name, value, readFile) => {
    if (/-----BEGIN [A-Z ]+-----/.test(value)) return value;
    try {
        return readFile(value.trim());
    } catch (err) {
        throw new Error(`${name} is neither a PEM nor a readable file (${value}): ${err.message}`);
    }
};

/**
 * The socket options (`ca`, `cert`, `key`) that RABBITMQ_SSL_CA, RABBITMQ_SSL_CERT and RABBITMQ_SSL_KEY ask for, each a PEM or the
 * path of a file. Empty when none is set, so a process without them connects exactly as it did before. The files are read now,
 * once: a renewed certificate needs a restart. Throws on a file that cannot be read and on a certificate without its key (or the
 * other way round) rather than letting the connection fail later in a way that is hard to tell from a network problem.
 *
 * @param {Object<string, string>} [env]
 * @param {function(string): (Buffer|string)} [readFile]
 */
const tlsFromEnv = (env = process.env, readFile = fs.readFileSync) => {
    const options = {};
    Object.keys(VARIABLES).forEach((option) => {
        const name = VARIABLES[option];
        const value = env[name] || '';
        if (value.trim()) options[option] = read(name, value, readFile);
    });

    if (Boolean(options.cert) !== Boolean(options.key)) {
        throw new Error(`${VARIABLES.cert} and ${VARIABLES.key} go together: only one of them is set`);
    }
    return options;
};

/**
 * Whether the url asks for TLS. Only a string or a list of strings can be told; an options object is taken as it is.
 */
const isSecureUrl = (url) => typeof url === 'string' ? /^amqps:/i.test(url) : true;

/**
 * The socket options of a client: what the environment asks for, under what the caller passed (the caller wins). Warns once when
 * TLS is asked for but a url is plain amqp://, because amqplib then ignores the certificates and connects in the clear.
 */
const withTlsFromEnv = (url, options, logger, env, readFile) => {
    const fromEnv = tlsFromEnv(env, readFile);
    if (!Object.keys(fromEnv).length) return options;

    const urls = Array.isArray(url) ? url : [url];
    if (!urls.every(isSecureUrl)) {
        logger.warn('[AMQP] RABBITMQ_SSL_* is set but a url is not amqps://: that connection is not encrypted.');
    }
    return Object.assign({}, fromEnv, options);
};

module.exports = {
    tlsFromEnv,
    withTlsFromEnv
};
