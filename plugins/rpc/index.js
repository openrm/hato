const Plugin = require('../base');
const { Scopes } = require('../../lib/constants');

const { EventEmitter } = require('events');
const Puid = require('puid');

module.exports = class RPCPlugin extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super('rpc');

        this.options = { uid, timeout };

        this._resp = new EventEmitter();
        this._configured = false;
    }

    init() {
        this.scopes[Scopes.API] = require('./api')(this);
        this.scopes[Scopes.CHANNEL] = this.assertReplyQueue();
    }

    assertReplyQueue() {
        return (create) => () => create()
            .then((ch) => ch
                .assertQueue('', {
                    durable: false,
                    exclusive: true,
                    autoDelete: true
                })
                .then(({ queue }) => this._replyTo = queue)
                .then(() => ch)
            );
    }

};
