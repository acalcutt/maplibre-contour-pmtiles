import { writeFileSync, mkdir } from "fs";
import { LocalDemManager } from "./dem-manager";
import { getChildren } from "@mapbox/tilebelt";
import type { Tile, Encoding } from "./types";

// Define an interface for parsed arguments
interface ParsedArgs {
  x: number;
  y: number;
  z: number;
  maxZoom: number;
  sFile: string;
  sEncoding: string;
  sMaxZoom: number;
  increment: number;
}

// Get command-line arguments
const args: string[] = process.argv.slice(2);

// Helper function to parse command-line arguments
function parseArgs(): ParsedArgs {
  let x: number | undefined;
  let y: number | undefined;
  let z: number | undefined;
  let maxZoom: number | undefined;
  let sFile: string | undefined;
  let sEncoding: string | undefined;
  let sMaxZoom: number | undefined;
  let increment: number | undefined;

  for (let i = 0; i < args.length; i += 2) {
    const argName = args[i];
    const argValue = args[i + 1];
    if (argName === "--x") {
      x = parseInt(argValue);
    } else if (argName === "--y") {
      y = parseInt(argValue);
    } else if (argName === "--z") {
      z = parseInt(argValue);
    } else if (argName === "--maxZoom") {
      maxZoom = parseInt(argValue);
    } else if (argName === "--sFile") {
      sFile = argValue;
    } else if (argName === "--sEncoding") {
      sEncoding = argValue;
    } else if (argName === "--sMaxZoom") {
      sMaxZoom = parseInt(argValue);
    } else if (argName === "--increment") {
      increment = parseInt(argValue);
    }
  }

  // Error handling, default values
  if (isNaN(x as number)) {
    throw new Error("Invalid --x argument. Must be a number.");
  }
  if (isNaN(y as number)) {
    throw new Error("Invalid --y argument. Must be a number.");
  }
  if (isNaN(z as number)) {
    throw new Error("Invalid --z argument. Must be a number.");
  }
  if (isNaN(maxZoom as number)) {
    throw new Error("Invalid --maxZoom argument. Must be a number.");
  }
  if (!sFile) {
    throw new Error("Invalid --sFile argument. Must be a string.");
  }
  if (!sEncoding) {
    throw new Error("Invalid --sEncoding argument. Must be a string.");
  }
  if (isNaN(sMaxZoom as number)) {
    throw new Error("Invalid --sMaxZoom argument. Must be a number.");
  }
  if (isNaN(increment as number)) {
    throw new Error("Invalid --increment argument. Must be a number.");
  }

  return {
    x: x as number,
    y: y as number,
    z: z as number,
    maxZoom: maxZoom as number,
    sFile: sFile as string,
    sEncoding: sEncoding as string,
    sMaxZoom: sMaxZoom as number,
    increment: increment as number,
  };
}
// Parse command line args and set defaults
let x: number,
  y: number,
  z: number,
  maxZoom: number,
  sFile: string,
  sEncoding: string,
  sMaxZoom: number,
  increment: number;
try {
  ({ x, y, z, maxZoom, sFile, sEncoding, sMaxZoom, increment } = parseArgs());
} catch (e: any) {
  console.error(e);
  console.error(
    "Usage: npx tsx ./src/generate-countour-tile-batch.ts --x <x> --y <y> --z <z> --maxZoom <maxZoom> --sFile <sFile> --sEncoding <sEncoding> --sMaxZoom <sMaxZoom> --increment <increment>",
  );
  process.exit(1);
}

function getAllChildren(tile: Tile, maxZoom: number): Tile[] {
  if (tile[2] >= maxZoom) return [tile];
  let allChildren: Tile[] = [];
  theChildren(tile);
  return allChildren;

  function theChildren(tile: Tile) {
    const children: Tile[] = getChildren(tile);
    allChildren = allChildren.concat(children);
    if (children[0][2] === maxZoom) return;
    children.forEach(theChildren);
  }
}

async function processTile(v: Tile): Promise<void> {
  const z: number = v[2];
  const x: number = v[0];
  const y: number = v[1];
  const dirPath: string = `./output/${z}/${x}`;
  const filePath: string = `${dirPath}/${y}.pbf`;

  let levels = increment
  if (z <= 7) {
    levels = 500
  } else if (z <= 9) {
    levels = 100
  } else if (z <= 11) {
    levels = 50
  }

  console.log(filePath);
  return manager
    .fetchContourTile(z, x, y, { levels: [levels] }, new AbortController())
    .then((tile) => {
      return new Promise<void>((resolve, reject) => {
        mkdir(dirPath, { recursive: true }, (err) => {
          if (err) {
            reject(err);
            return;
          }
          writeFileSync(filePath, Buffer.from(tile.arrayBuffer));
          resolve();
        });
      });
    });
}

async function processQueue(
  queue: Tile[],
  batchSize: number = 25,
): Promise<void> {
  for (let i = 0; i < queue.length; i += batchSize) {
    const batch = queue.slice(i, i + batchSize);
    await Promise.all(batch.map(processTile));
    console.log(
      `Processed batch ${i / batchSize + 1} of ${Math.ceil(
        queue.length / batchSize,
      )}`,
    );
  }
}

const manager: LocalDemManager = new LocalDemManager(
  sFile,
  100,
  sEncoding as Encoding,
  sMaxZoom,
  10000,
);
manager.initializePMTiles();

// Use parsed command line args
const children: Tile[] = getAllChildren([x, y, z], maxZoom);

children.sort((a, b) => {
  //Sort by Z first
  if (a[2] !== b[2]) return a[2] - b[2];
  //If Z is equal, sort by X
  if (a[0] !== b[0]) return a[0] - b[0];
  //If Z and X are equal, sort by Y
  return a[1] - b[1];
});

processQueue(children).then(() => {
  console.log("All files written!");
});
