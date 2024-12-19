import Actor from "./actor";
import type WorkerDispatch from "./worker-dispatch";
import type { DemManager } from "./dem-manager";
import { Timer } from "./performance";
import type { ContourTile, DemTile, Encoding, FetchResponse, IndividualContourTileOptions } from "./types";
import { PMTiles } from "pmtiles";
export declare class MainThreadDispatch {
    decodeImage: (blob: Blob, encoding: Encoding, abortController: AbortController) => Promise<import("./types").TransferrableDemTile>;
}
/**
 * Caches, decodes, and processes raster tiles in a shared web worker.
 */
export default class RemoteDemManager implements DemManager {
    managerId: number;
    actor: Actor<WorkerDispatch>;
    loaded: Promise<any>;
    pmtiles: PMTiles | null;
    fileUrl: string;
    constructor(fileUrl: string, cacheSize: number, encoding: Encoding, maxzoom: number, timeoutMs: number, actor?: Actor<WorkerDispatch>);
    initializePMTiles(): Promise<void>;
    fetchTile: (z: number, x: number, y: number, abortController: AbortController, timer?: Timer) => Promise<FetchResponse>;
    fetchAndParseTile: (z: number, x: number, y: number, abortController: AbortController, timer?: Timer) => Promise<DemTile>;
    fetchContourTile: (z: number, x: number, y: number, options: IndividualContourTileOptions, abortController: AbortController, timer?: Timer) => Promise<ContourTile>;
}
