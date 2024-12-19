import type { DemTile, Encoding } from "./types";
declare const defaultDecoder: (blob: Blob, encoding: Encoding, abortController: AbortController) => Promise<DemTile>;
export default defaultDecoder;
export declare function decodeParsedImage(width: number, height: number, encoding: Encoding, input: Uint8ClampedArray): DemTile;
