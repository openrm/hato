# hato

[![CircleCI](https://img.shields.io/circleci/build/github/openrm/hato)](https://app.circleci.com/pipelines/github/openrm/hato?branch=master)
[![npm](https://img.shields.io/npm/v/hato)](https://www.npmjs.com/package/hato)
![node-lts](https://img.shields.io/node/v-lts/hato)
![npm peer dependency version](https://img.shields.io/npm/dependency-version/hato/peer/amqplib)
[![Code Climate maintainability](https://img.shields.io/codeclimate/maintainability/openrm/hato)](https://codeclimate.com/github/openrm/hato/maintainability)
[![Code Climate coverage](https://img.shields.io/codeclimate/coverage/openrm/hato)](https://codeclimate.com/github/openrm/hato/test_coverage)
[![GitHub](https://img.shields.io/github/license/openrm/hato)](https://github.com/openrm/hato/blob/master/LICENSE)

A minimalist, customizeable AMQP framework

## Installation
```sh
$ npm install hato amqplib
```

## About
hato aims to simplify messaging without diminishing the flexibility and power in doing so.

This library is highly customizeable. Plugins allow for a configuration that fits your project and for extension of the library to meet unique requirements.

The library is built upon [amqplib](https://www.npmjs.com/package/amqplib) and is compatible with AMQP 0-9-1 and is promise based (the implementation of which can be overriden).

## Getting Started

Include the library and plugins

```js
const { Client, plugins } = require('hato');
```


Construct a new client
```js
const client = new Client(BROKER_URL, {
    plugins: [
        'gracefulShutdown', // register plugin with default options
        'connectionRetry',
        'duplex',
        new plugins.Encoding('json') // instantiate for a detailed configuration
    ],

    /**
     * Optionally specify a module for logging
     */
    logger: myLogger
});
```

Create a queue and subscribe to an event
```js
client
    .type('topic')
    .queue('my.queue', { exclusive: true })
    .subscribe('an.event', (msg) => {
        console.log(msg);

        // Acknowladge the message
        msg.ack();
    });
```

Start the client
```js
client
    .start()
    .catch(console.error);
````

After the client started, you can publish a message to the queue
```js
client
    .type('topic')
    .publish('an.event', Buffer.from('An event'))
    .catch(console.error);
```

## TLS

Use an `amqps://` URL and the client reads three environment variables, each a PEM or the path of a file:

| Variable | Socket option | For |
|---|---|---|
| `RABBITMQ_SSL_CA` | `ca` | verifying the broker (a private CA; without it the system roots are used) |
| `RABBITMQ_SSL_CERT`, `RABBITMQ_SSL_KEY` | `cert`, `key` | mutual TLS: the client certificate (the two go together) |

Nothing changes when they are not set. An option passed to `Client` (`ca`, `cert`, `key`, ...) wins over the variable. The files are read when
the client is created, so a renewed certificate needs a restart; an unreadable file or a certificate without its key throws then, not on the
first connection. With the variables set and an `amqp://` URL the connection is **not** encrypted (amqplib ignores the certificates):
the client logs a warning. `hato.tlsFromEnv()` returns the options for code that calls amqplib itself.

## Running Tests

Make sure you have a message broker running. The tests expect [RabbitMQ](https://www.rabbitmq.com/).

```sh
$ docker run -it --name rabbitmq -p 5672:5672 rabbitmq:4-alpine
```
Then run
```sh
$ make test
$ make tdd
$ make lint
```

## License
[MIT](https://github.com/openrm/hato/blob/master/LICENSE)
