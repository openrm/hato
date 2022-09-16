import { type EventEmitter } from 'events'

export as namespace hato;

/**
 * Plugins
 */
export class Plugin {
    constructor(name?: string)
}

export class RPC extends Plugin {
    constructor({ timeout }: { timeout: number })
}

export class Retry extends Plugin {
    constructor({ base }: { base: number })
}

export class ServiceContext extends Plugin {
    constructor({ name, version }: { name: string, version:  string })
}

type Defaults = {
    prefetch: number
    queue: {
        durable: boolean
    },
    exchange: {
        durable: boolean
    }
    publish: {
        persistent: boolean
        mandatory: boolean
    }
}

export class DefaultOptions extends Plugin {
    constructor(options: Defaults)
}

export const plugins: {
    GracefulShutdown: typeof Plugin,
    ConnectionRetry: typeof Plugin,
    Duplex: typeof Plugin,
    DLX: typeof Plugin,
    Encoding: typeof Plugin,
    RPC: typeof RPC,
    Confirm: typeof Plugin,
    Retry: typeof Retry,
    ServiceContext: typeof ServiceContext,
    DefaultOptions: typeof DefaultOptions,
    Base: typeof Plugin
}

/**
 * Client
 */

interface Logger {
    debug(message: string): void
    info(message: string): void
    warn(message: string): void
    error(message: string): void
}

type Options = {
    logger: Logger
    plugins: Array<Plugin>
}

export class Client extends EventEmitter {
    public plugins: Array<Plugin>

    constructor(rabbitmqURL: string, options: Options)

    start(): this
    close(): this
}
