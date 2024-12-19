define(['./shared'], (function (actor) { 'use strict';

const noManager = (managerId) => Promise.reject(new Error(`No manager registered for ${managerId}`));
/**
 * Receives messages from an actor in the web worker.
 */
class WorkerDispatch {
    constructor() {
        /** There is one worker shared between all managers in the main thread using the plugin, so need to store each of their configurations. */
        this.managers = {};
        this.init = (message, _) => {
            this.managers[message.managerId] = new actor.L(message.fileUrl, message.cacheSize, message.encoding, message.maxzoom, message.timeoutMs);
            this.managers[message.managerId].initializePMTiles();
            return Promise.resolve();
        };
        this.fetchTile = (managerId, z, x, y, abortController, timer) => {
            var _a;
            return ((_a = this.managers[managerId]) === null || _a === void 0 ? void 0 : _a.fetchTile(z, x, y, abortController, timer)) ||
                noManager(managerId);
        };
        this.fetchAndParseTile = (managerId, z, x, y, abortController, timer) => {
            var _a;
            return actor.p(((_a = this.managers[managerId]) === null || _a === void 0 ? void 0 : _a.fetchAndParseTile(z, x, y, abortController, timer)) || noManager(managerId), true);
        };
        this.fetchContourTile = (managerId, z, x, y, options, abortController, timer) => {
            var _a;
            return actor.f(((_a = this.managers[managerId]) === null || _a === void 0 ? void 0 : _a.fetchContourTile(z, x, y, options, abortController, timer)) || noManager(managerId));
        };
    }
}

const g = typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
        ? window
        : global;
g.actor = new actor.A(g, new WorkerDispatch());

}));
