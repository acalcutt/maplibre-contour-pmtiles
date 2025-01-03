import { LocalDemManager } from "./local-dem-manager";
import { Timer } from "./performance";
import type {
  ContourTile,
  FetchResponse,
  IndividualContourTileOptions,
  InitMessage,
  TransferrableDemTile,
} from "./types";
import { prepareContourTile, prepareDemTile } from "./utils";

const noManager = (managerId: number): Promise<any> =>
  Promise.reject(new Error(`No manager registered for ${managerId}`));

/**
 * Receives messages from an actor in the web worker.
 */
export default class WorkerDispatch {
  /** There is one worker shared between all managers in the main thread using the plugin, so need to store each of their configurations. */
  managers: { [id: number]: LocalDemManager } = {};

  init = (message: InitMessage, _: AbortController): Promise<void> => {
    this.managers[message.managerId] = new LocalDemManager(message);
    return Promise.resolve();
  };

  fetchTile = (
    managerId: number,
    z: number,
    x: number,
    y: number,
    abortController: AbortController,
    timer?: Timer,
  ): Promise<FetchResponse> =>
    this.managers[managerId]?.fetchTile(z, x, y, abortController, timer) ||
    noManager(managerId);

  fetchAndParseTile = (
    managerId: number,
    z: number,
    x: number,
    y: number,
    abortController: AbortController,
    timer?: Timer,
  ): Promise<TransferrableDemTile> =>
    prepareDemTile(
      this.managers[managerId]?.fetchAndParseTile(
        z,
        x,
        y,
        abortController,
        timer,
      ) || noManager(managerId),
      true,
    );

  fetchContourTile = (
    managerId: number,
    z: number,
    x: number,
    y: number,
    options: IndividualContourTileOptions,
    abortController: AbortController,
    timer?: Timer,
  ): Promise<ContourTile> =>
    prepareContourTile(
      this.managers[managerId]?.fetchContourTile(
        z,
        x,
        y,
        options,
        abortController,
        timer,
      ) || noManager(managerId),
    );
}
