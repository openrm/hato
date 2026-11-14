import events from 'events'
import amqplib from 'amqplib'

export as namespace hato;

/**
 * Types
 */
export type ExchangeType = 'fanout' | 'direct' | 'topic' | 'headers';

export interface Consumer extends Promise<amqplib.Replies.Consume>, events.EventEmitter {}

export interface ConsumeMessage extends amqplib.ConsumeMessage {
    ack(allUpTo?: boolean): void
    nack(allUpTo?: boolean, requeue?: boolean): void
    cancel(): void
}

/**
 * Plugins
 */
export namespace Plugins {
    abstract class Base {
        constructor(name: string)
        abstract init(): void;
        abstract destroy(): void;
    }
    interface Plugin<T> extends Plugins.Base {
        new(options?: T): Plugin<T>
    }
    /** An instance of the GracefulShutdown plugin; the methods are for an application that handles the signals itself */
    interface GracefulShutdownPlugin extends Plugin<Options.GracefulShutdown> {
        /** The number of messages being processed */
        readonly inflight: number
        /** Stops the delivery of new messages to the subscriptions (not the reply queue of the RPC plugin) */
        stopConsuming(): Promise<void>
        /** Resolves true once no message is being processed, false if `timeout` ms pass first (default: that of the plugin, or 30000) */
        drain(timeout?: number): Promise<boolean>
    }
    interface Defaults {
        Base: Base
        GracefulShutdown: { new(options?: Options.GracefulShutdown): GracefulShutdownPlugin }
        ConnectionRetry: Plugin<Options.ConnectionRetry>
        Duplex: Plugin<Options.Duplex>
        DLX: Plugin<Options.DLX>
        Encoding: Plugin<Options.Encoding>
        RPC: Plugin<Options.RPC>
        Confirm: Plugin<Options.Confirm>
        Retry: Plugin<Options.Retry>
        ServiceContext: Plugin<Options.ServiceContext>
        DefaultOptions: Plugin<Options.DefaultOptions>
    }
    namespace Options {
        interface GracefulShutdown {
            /**
             * On SIGINT and SIGTERM, stop the subscriptions and wait for the messages being processed before
             * closing the connection. Default: `true`, which waits up to 30000 ms. `false` closes the
             * connection at once.
             */
            drain?: boolean | { timeout?: number }
            /**
             * The signals to handle. Default: `true`, which is `['SIGINT', 'SIGTERM']`. `false` or `[]`
             * handles none: the application does, with `stopConsuming()` and `drain()` of the plugin
             * instance, and closes the client itself.
             */
            signals?: boolean | NodeJS.Signals[]
        }
        interface ConnectionRetry {
            /** attempts before giving up (default: 30, about 4.5 minutes with the default backoff) */
            retries?: number
            /** first wait in ms (default: 1000) */
            min?: number
            /** longest wait in ms (default: 10000) */
            max?: number
            base?: number
            /** share of each wait, 0 to 1, taken away at random so that replicas do not retry together (default: 0.5) */
            jitter?: number
            /** start from a random url when given an array (default: true) */
            shuffle?: boolean
        }
        type Duplex = null;
        interface DLX {
            name?: string,
                type?: ExchangeType,
                options?: amqplib.Options.AssertExchange
        }
        type Encoding = 'json';
        interface RPC {
            uid?: () => string
            timeout?: number
        }
        interface Confirm {
            uid?: () => string
        }
        interface Retry {
            retries?: number
            strategy?: 'constant' | 'linear' | 'exponential'
            min?: number
            max?: number
            base?: number
        }
        interface ServiceContext {
            name?: string,
            version?: string
            instanceId?: string
            namespace?: string
            queue?: { options?: amqplib.Options.AssertQueue }
        }
        interface DefaultOptions {
            prefetch?: number
            queue?: amqplib.Options.AssertQueue
            exchange?: amqplib.Options.AssertExchange
            consume?: amqplib.Options.Consume
            publish?: amqplib.Options.Publish
        }
    }
}

export const plugins: Plugins.Defaults

/**
 * Client
 */

interface Logger {
    debug(message: string): void
    info(message: string): void
    warn(message: string): void
    error(message: string): void
}

interface API {
    assert(enable: boolean): this
    prefetch(count: number): this
    type(type: ExchangeType): this
    exchange(exchange: string, type?: ExchangeType, options?: amqplib.Options.AssertExchange): this
    queue(name: string, options?: amqplib.Options.AssertQueue): this
    subscribe(pattern: string, fn: (msg: ConsumeMessage) => void, options?: amqplib.Options.Consume): Consumer
    consume(pattern: string, fn: (msg: ConsumeMessage) => void, options?: amqplib.Options.Consume): Consumer
    cancel(consumerTag: string): Promise<amqplib.Replies.Empty>
    publish(routingKey: string, content: Buffer, options?: amqplib.Options.Publish): Promise<void>;
}

/**
 * A url (or options object) for amqplib. An array of them is only supported
 * when the `conn-retry` plugin is enabled: each attempt uses the next entry.
 */
type ConnectUrl = Parameters<typeof amqplib.connect>[0] | Parameters<typeof amqplib.connect>[0][]

interface Options {
    logger?: Logger
    plugins?: (Plugins.Plugin<any> | string)[]
}

export interface IClient extends events.EventEmitter, API {
    new(url: ConnectUrl, options?: Options): this
    start(url: ConnectUrl, options?: Options): Promise<this>

    start(): Promise<this>
    close(): Promise<void>
}

export const Client: IClient;
export function connect(url: ConnectUrl, options?: Options): Promise<IClient>
