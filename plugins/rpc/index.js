const Plugin = require('../base');
const { Scopes } = require('../../lib/constants');

const Puid = require('puid');

module.exports = class RPCPlugin extends Plugin {

    constructor({ uid = new Puid(), timeout = 0 } = {}) {
        super('rpc');

        this.options = { uid, timeout };
    }

    init() {
        this.scopes[Scopes.API] = require('./api')(this.options);
    }

};
