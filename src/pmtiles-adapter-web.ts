import { PMTiles, FetchSource } from "pmtiles";
import type { Encoding } from "./types";

export function openPMtiles(FilePath: string): PMTiles {
  const source = new FetchSource(FilePath);
  const pmtiles = new PMTiles(source);
  return pmtiles;
}

export async function getPMtilesTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number,
): Promise<{ data: ArrayBuffer | undefined }> {
  try {
    const zxyTile = await pmtiles.getZxy(z, x, y);

    if (zxyTile && zxyTile.data) {
      return { data: zxyTile.data };
    } else {
      return { data: undefined };
    }
  } catch (error) {
    console.error("Error fetching tile:", error);
    return { data: undefined };
  }
}

export async function GetImageData(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  blob: Blob,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  encoding: Encoding,
): Promise<undefined> {
  return undefined;
}
