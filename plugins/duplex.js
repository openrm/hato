// @ts-nocheck

const { EventEmitter } = require('events');
const Plugin = require('./base');
const helpers = require('./helpers');
const { Scopes } = require('../lib/constants');

const Modes = {
    PUBLICATION: 'publication',
    SUBSCRIPTION: 'subscription'
};

const chainAll = (promises) => {
    const arr = [];
    return promises
        .reduce((chain, promise) =>
            chain.then((prev) => (arr.push(prev), promise())),
        promises.shift()())
        .then(() => arr);
};

class DuplexConnection extends EventEmitter {
    constructor(connect) {
        super();
        this._conns = {};
        this._connect = connect;
    }
    connect(...args) {
        const cxns = Object.values(Modes).map((mode) => this._conns[mode] = this._connect(...args)
            .then((conn) => {
                helpers.events.forward(conn, this, 'error', 'close');
                return conn;
            }));
        return Promise.all(cxns).then(() => this);
    }
    _createChannel(confirm, mode) {
        const connecting = this._conns[mode];
        return confirm ?
            connecting.then((conn) => conn.createConfirmChannel()) :
            connecting.then((conn) => conn.createChannel());
    }
    close() {
        return Promise.all(Object
            .values(this._conns)
            .map((promise) => promise.then((conn) => conn.close())));
    }
    createChannel() {
        return new DuplexChannel(this._createChannel.bind(this, false)).create();
    }
    createConfirmChannel() {
        return new DuplexChannel(this._createChannel.bind(this, true)).create();
    }
}

class DuplexChannel extends EventEmitter {
    constructor(create) {
        super();
        this._chs = {};
        this._create = create;
    }
    create() {
        const modes = [Modes.PUBLICATION, Modes.SUBSCRIPTION];
        const open = modes
            .map((mode) => this._chs[mode] = this._create(mode));
        return Promise.all(open)
            .then((chs) => chs.map((ch) => {
                helpers.events.forwardAll(this, ch, true, ['delivery', 'return']);
                return ch;
            }))
            .then(([pubCh, subCh]) => {
                helpers.expose(pubCh, this, ...[
                    'publish',
                    'sendToQueue',
                    'waitForConfirms',
                    'assertExchange',
                    'checkExchange',
                    'deleteExchange',
                    'bindExchange'
                ]);
                helpers.expose(subCh, this, ...[
                    'consume',
                    'cancel',
                    'get',
                    'ack',
                    'ackAll',
                    'nack',
                    'nackAll',
                    'reject',
                    'prefetch',
                    'assertQueue',
                    'checkQueue',
                    'deleteQueue',
                    'purgeQueue',
                    'bindQueue',
                    'unbindQueue'
                ]);
                ['close', 'recover'].forEach((member) => {
                    this[member] = function() {
                        return chainAll([
                            pubCh[member].bind(pubCh),
                            subCh[member].bind(subCh)
                        ]);
                    };
                });
                return this;
            });
    }
}

module.exports = class extends Plugin {

    constructor() {
        super('duplex');
    }

    init() {
        this.scopes[Scopes.CONNECTION] = (connect) => {
            const duplex = new DuplexConnection(connect);
            return duplex.connect.bind(duplex);
        };
    }

};
