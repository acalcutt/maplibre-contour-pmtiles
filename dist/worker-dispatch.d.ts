import { LocalDemManager } from "./dem-manager";
import { Timer } from "./performance";
import type { ContourTile, FetchResponse, IndividualContourTileOptions, InitMessage, TransferrableDemTile } from "./types";
/**
 * Receives messages from an actor in the web worker.
 */
export default class WorkerDispatch {
    /** There is one worker shared between all managers in the main thread using the plugin, so need to store each of their configurations. */
    managers: {
        [id: number]: LocalDemManager;
    };
    init: (message: InitMessage, _: AbortController) => Promise<void>;
    fetchTile: (managerId: number, z: number, x: number, y: number, abortController: AbortController, timer?: Timer) => Promise<FetchResponse>;
    fetchAndParseTile: (managerId: number, z: number, x: number, y: number, abortController: AbortController, timer?: Timer) => Promise<TransferrableDemTile>;
    fetchContourTile: (managerId: number, z: number, x: number, y: number, options: IndividualContourTileOptions, abortController: AbortController, timer?: Timer) => Promise<ContourTile>;
}
