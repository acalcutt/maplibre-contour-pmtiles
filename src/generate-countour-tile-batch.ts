import { writeFileSync, mkdir } from "fs";
import { LocalDemManager } from "./dem-manager";
import { getChildren } from "@mapbox/tilebelt";

// Get command-line arguments
const args = process.argv.slice(2);

// Helper function to parse command-line arguments
function parseArgs() {
  let x, y, z, maxZoom;
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
    }
  }

  // Error handling, default values
    if(isNaN(x)){
      throw new Error("Invalid --x argument. Must be a number.")
    }
    if(isNaN(y)){
        throw new Error("Invalid --y argument. Must be a number.")
      }
      if(isNaN(z)){
        throw new Error("Invalid --z argument. Must be a number.")
      }
      if(isNaN(maxZoom)){
        throw new Error("Invalid --maxZoom argument. Must be a number.")
      }


  return { x, y, z, maxZoom };
}
// Parse command line args and set defaults
let x, y, z, maxZoom;
try{
    ({x,y,z, maxZoom} = parseArgs())
} catch(e) {
    console.error(e);
    console.error("Usage: npx tsx ./src/generate-countour-tile-batch.ts --x <x> --y <y> --z <z> --maxZoom <maxZoom>")
    process.exit(1);
}


function getAllChildren(tile: [number, number, number], maxZoom: number) {
  if (tile[2] >= maxZoom) return [tile];
  var zoomDiff = maxZoom - tile[2];
  var allChildren: [number, number, number][] = [];
  theChildren(tile);
  return allChildren;

  function theChildren(tile: [number, number, number]) {
    var children = getChildren(tile);
    allChildren = allChildren.concat(children);
    if (children[0][2] === maxZoom) return;
    children.forEach(theChildren);
  }
}

async function processTile(v: [number, number, number]) {
  const reordered = [v[2], v[0], v[1]];
  const z = v[2];
  const x = v[0];
  const y = v[1];
  const dirPath = `./output/${z}/${x}`;
  const filePath = `${dirPath}/${y}.mvt`;
  console.log(filePath);
  return manager
    .fetchContourTile(z, x, y, { levels: [10] }, new AbortController())
    .then((tile) => {
      return new Promise((resolve, reject) => {
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

async function processQueue(queue: [number, number, number][], batchSize = 25) {
  for (let i = 0; i < queue.length; i += batchSize) {
    const batch = queue.slice(i, i + batchSize);
    await Promise.all(batch.map(processTile));
    console.log(
      `Processed batch ${i / batchSize + 1} of ${Math.ceil(
        queue.length / batchSize
      )}`
    );
  }
}

let manager = new LocalDemManager(
  "/mnt/c/Users/Andrew/Desktop/Junk/tile_data/pmtiles/gebco_terrarium0-8.pmtiles",
  100,
  "terrarium",
  8,
  10000
);
manager.initializePMTiles();

// Use parsed command line args
var children = getAllChildren([x, y, z], maxZoom);

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