import { Timer } from "./performance";
import type { Timing } from "./types";
interface Cancel {
    type: "cancel";
    id: number;
}
interface Response {
    type: "response";
    id: number;
    error?: string;
    response?: any;
    timings: Timing;
}
interface Request {
    type: "request";
    id?: number;
    name: string;
    args: any[];
}
type Message = Cancel | Response | Request;
type MethodsReturning<T, R> = {
    [K in keyof T]: T[K] extends (...args: any) => R ? T[K] : never;
};
type Head<T extends any[]> = T extends [...infer Head, any] ? Head : any[];
/**
 * Utility for sending messages to a remote instance of `<T>` running in a web worker
 * from the main thread, or in the main thread running from a web worker.
 */
export default class Actor<T> {
    callbacks: {
        [id: number]: (error: Error | undefined, message: any, timings: Timing) => void;
    };
    cancels: {
        [id: number]: AbortController;
    };
    dest: Worker;
    timeoutMs: number;
    constructor(dest: Worker, dispatcher: any, timeoutMs?: number);
    postMessage(message: Message, transferrables?: Transferable[]): void;
    /** Invokes a method by name with a set of arguments in the remote context. */
    send<R, M extends MethodsReturning<T, Promise<R>>, K extends keyof M & string, P extends Head<Parameters<M[K]>>>(name: K, transferrables: Transferable[], abortController: AbortController, timer?: Timer, ...args: P): Promise<R>;
}
export {};
