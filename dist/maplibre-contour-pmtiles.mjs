/* eslint-disable */

var shared, worker, mlcontour;
// define gets called three times: one for each chunk. we rely on the order
// they're imported to know which is which
function define(_, chunk) {
  if (!shared) {
    shared = chunk;
  } else if (!worker) {
    worker = chunk;
  } else {
    var workerBundleString =
      "var sharedChunk = {}; (" +
      shared +
      ")(sharedChunk); (" +
      worker +
      ")(sharedChunk);";

    var sharedChunk = {};
    shared(sharedChunk);
    mlcontour = chunk(sharedChunk);
    if (typeof window !== "undefined") {
      mlcontour.workerUrl = window.URL.createObjectURL(
        new Blob([workerBundleString], { type: "text/javascript" })
      );
    }
  }
}


define(['exports'], (function (exports) { 'use strict';

/*
Adapted from d3-contour https://github.com/d3/d3-contour

Copyright 2012-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
class Fragment {
    constructor(start, end) {
        this.start = start;
        this.end = end;
        this.points = [];
        this.append = this.append.bind(this);
        this.prepend = this.prepend.bind(this);
    }
    append(x, y) {
        this.points.push(Math.round(x), Math.round(y));
    }
    prepend(x, y) {
        this.points.splice(0, 0, Math.round(x), Math.round(y));
    }
    lineString() {
        return this.toArray();
    }
    isEmpty() {
        return this.points.length < 2;
    }
    appendFragment(other) {
        this.points.push(...other.points);
        this.end = other.end;
    }
    toArray() {
        return this.points;
    }
}
const CASES = [
    [],
    [
        [
            [1, 2],
            [0, 1],
        ],
    ],
    [
        [
            [2, 1],
            [1, 2],
        ],
    ],
    [
        [
            [2, 1],
            [0, 1],
        ],
    ],
    [
        [
            [1, 0],
            [2, 1],
        ],
    ],
    [
        [
            [1, 2],
            [0, 1],
        ],
        [
            [1, 0],
            [2, 1],
        ],
    ],
    [
        [
            [1, 0],
            [1, 2],
        ],
    ],
    [
        [
            [1, 0],
            [0, 1],
        ],
    ],
    [
        [
            [0, 1],
            [1, 0],
        ],
    ],
    [
        [
            [1, 2],
            [1, 0],
        ],
    ],
    [
        [
            [0, 1],
            [1, 0],
        ],
        [
            [2, 1],
            [1, 2],
        ],
    ],
    [
        [
            [2, 1],
            [1, 0],
        ],
    ],
    [
        [
            [0, 1],
            [2, 1],
        ],
    ],
    [
        [
            [1, 2],
            [2, 1],
        ],
    ],
    [
        [
            [0, 1],
            [1, 2],
        ],
    ],
    [],
];
function index(width, x, y, point) {
    x = x * 2 + point[0];
    y = y * 2 + point[1];
    return x + y * (width + 1) * 2;
}
function ratio(a, b, c) {
    return (b - a) / (c - a);
}
/**
 * Generates contour lines from a HeightTile
 *
 * @param interval Vertical distance between contours
 * @param tile The input height tile, where values represent the height at the top-left of each pixel
 * @param extent Vector tile extent (default 4096)
 * @param buffer How many pixels into each neighboring tile to include in a tile
 * @returns an object where keys are the elevation, and values are a list of `[x1, y1, x2, y2, ...]`
 * contour lines in tile coordinates
 */
function generateIsolines(interval, tile, extent = 4096, buffer = 1) {
    if (!interval) {
        return {};
    }
    const multiplier = extent / (tile.width - 1);
    let tld, trd, bld, brd;
    let r, c;
    const segments = {};
    const fragmentByStartByLevel = new Map();
    const fragmentByEndByLevel = new Map();
    function interpolate(point, threshold, accept) {
        if (point[0] === 0) {
            // left
            accept(multiplier * (c - 1), multiplier * (r - ratio(bld, threshold, tld)));
        }
        else if (point[0] === 2) {
            // right
            accept(multiplier * c, multiplier * (r - ratio(brd, threshold, trd)));
        }
        else if (point[1] === 0) {
            // top
            accept(multiplier * (c - ratio(trd, threshold, tld)), multiplier * (r - 1));
        }
        else {
            // bottom
            accept(multiplier * (c - ratio(brd, threshold, bld)), multiplier * r);
        }
    }
    // Most marching-squares implementations (d3-contour, gdal-contour) make one pass through the matrix per threshold.
    // This implementation makes a single pass through the matrix, building up all of the contour lines at the
    // same time to improve performance.
    for (r = 1 - buffer; r < tile.height + buffer; r++) {
        trd = tile.get(0, r - 1);
        brd = tile.get(0, r);
        let minR = Math.min(trd, brd);
        let maxR = Math.max(trd, brd);
        for (c = 1 - buffer; c < tile.width + buffer; c++) {
            tld = trd;
            bld = brd;
            trd = tile.get(c, r - 1);
            brd = tile.get(c, r);
            const minL = minR;
            const maxL = maxR;
            minR = Math.min(trd, brd);
            maxR = Math.max(trd, brd);
            if (isNaN(tld) || isNaN(trd) || isNaN(brd) || isNaN(bld)) {
                continue;
            }
            const min = Math.min(minL, minR);
            const max = Math.max(maxL, maxR);
            const start = Math.ceil(min / interval) * interval;
            const end = Math.floor(max / interval) * interval;
            for (let threshold = start; threshold <= end; threshold += interval) {
                const tl = tld > threshold;
                const tr = trd > threshold;
                const bl = bld > threshold;
                const br = brd > threshold;
                for (const segment of CASES[(tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)]) {
                    let fragmentByStart = fragmentByStartByLevel.get(threshold);
                    if (!fragmentByStart)
                        fragmentByStartByLevel.set(threshold, (fragmentByStart = new Map()));
                    let fragmentByEnd = fragmentByEndByLevel.get(threshold);
                    if (!fragmentByEnd)
                        fragmentByEndByLevel.set(threshold, (fragmentByEnd = new Map()));
                    const start = segment[0];
                    const end = segment[1];
                    const startIndex = index(tile.width, c, r, start);
                    const endIndex = index(tile.width, c, r, end);
                    let f, g;
                    if ((f = fragmentByEnd.get(startIndex))) {
                        fragmentByEnd.delete(startIndex);
                        if ((g = fragmentByStart.get(endIndex))) {
                            fragmentByStart.delete(endIndex);
                            if (f === g) {
                                // closing a ring
                                interpolate(end, threshold, f.append);
                                if (!f.isEmpty()) {
                                    let list = segments[threshold];
                                    if (!list) {
                                        segments[threshold] = list = [];
                                    }
                                    list.push(f.lineString());
                                }
                            }
                            else {
                                // connecting 2 segments
                                f.appendFragment(g);
                                fragmentByEnd.set((f.end = g.end), f);
                            }
                        }
                        else {
                            // adding to the end of f
                            interpolate(end, threshold, f.append);
                            fragmentByEnd.set((f.end = endIndex), f);
                        }
                    }
                    else if ((f = fragmentByStart.get(endIndex))) {
                        fragmentByStart.delete(endIndex);
                        // extending the start of f
                        interpolate(start, threshold, f.prepend);
                        fragmentByStart.set((f.start = startIndex), f);
                    }
                    else {
                        // starting a new fragment
                        const newFrag = new Fragment(startIndex, endIndex);
                        interpolate(start, threshold, newFrag.append);
                        interpolate(end, threshold, newFrag.append);
                        fragmentByStart.set(startIndex, newFrag);
                        fragmentByEnd.set(endIndex, newFrag);
                    }
                }
            }
        }
    }
    for (const [level, fragmentByStart] of fragmentByStartByLevel.entries()) {
        let list = null;
        for (const value of fragmentByStart.values()) {
            if (!value.isEmpty()) {
                if (list == null) {
                    list = segments[level] || (segments[level] = []);
                }
                list.push(value.lineString());
            }
        }
    }
    return segments;
}

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */


function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function sortedEntries(object) {
    const entries = Object.entries(object);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
}
function encodeThresholds(thresholds) {
    return sortedEntries(thresholds)
        .map(([key, value]) => [key, ...(typeof value === "number" ? [value] : value)].join("*"))
        .join("~");
}
function decodeThresholds(thresholds) {
    return Object.fromEntries(thresholds
        .split("~")
        .map((part) => part.split("*").map(Number))
        .map(([key, ...values]) => [key, values]));
}
function encodeOptions(_a) {
    var { thresholds } = _a, rest = __rest(_a, ["thresholds"]);
    return sortedEntries(Object.assign({ thresholds: encodeThresholds(thresholds) }, rest))
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}
function decodeOptions(options) {
    return Object.fromEntries(options
        .replace(/^.*\?/, "")
        .split("&")
        .map((part) => {
        const parts = part.split("=").map(decodeURIComponent);
        const k = parts[0];
        let v = parts[1];
        switch (k) {
            case "thresholds":
                v = decodeThresholds(v);
                break;
            case "extent":
            case "multiplier":
            case "overzoom":
            case "buffer":
                v = Number(v);
        }
        return [k, v];
    }));
}
function encodeIndividualOptions(options) {
    return sortedEntries(options)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join(",");
}
function getOptionsForZoom(options, zoom) {
    const { thresholds } = options, rest = __rest(options, ["thresholds"]);
    let levels = [];
    let maxLessThanOrEqualTo = -Infinity;
    Object.entries(thresholds).forEach(([zString, value]) => {
        const z = Number(zString);
        if (z <= zoom && z > maxLessThanOrEqualTo) {
            maxLessThanOrEqualTo = z;
            levels = typeof value === "number" ? [value] : value;
        }
    });
    return Object.assign({ levels }, rest);
}
function copy(src) {
    const dst = new ArrayBuffer(src.byteLength);
    new Uint8Array(dst).set(new Uint8Array(src));
    return dst;
}
function prepareDemTile(promise, copy) {
    return promise.then((_a) => {
        var { data } = _a, rest = __rest(_a, ["data"]);
        let newData = data;
        if (copy) {
            newData = new Float32Array(data.length);
            newData.set(data);
        }
        return Object.assign(Object.assign({}, rest), { data: newData, transferrables: [newData.buffer] });
    });
}
function prepareContourTile(promise) {
    return promise.then(({ arrayBuffer }) => {
        const clone = copy(arrayBuffer);
        return {
            arrayBuffer: clone,
            transferrables: [clone],
        };
    });
}
let supportsOffscreenCanvas = null;
function offscreenCanvasSupported() {
    if (supportsOffscreenCanvas == null) {
        supportsOffscreenCanvas =
            typeof OffscreenCanvas !== "undefined" &&
                new OffscreenCanvas(1, 1).getContext("2d") &&
                typeof createImageBitmap === "function";
    }
    return supportsOffscreenCanvas || false;
}
let useVideoFrame = null;
function shouldUseVideoFrame() {
    if (useVideoFrame == null) {
        useVideoFrame = false;
        // if webcodec is supported, AND if the browser mangles getImageData results
        // (ie. safari with increased privacy protections) then use webcodec VideoFrame API
        if (offscreenCanvasSupported() && typeof VideoFrame !== "undefined") {
            const size = 5;
            const canvas = new OffscreenCanvas(5, 5);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context) {
                for (let i = 0; i < size * size; i++) {
                    const base = i * 4;
                    context.fillStyle = `rgb(${base},${base + 1},${base + 2})`;
                    context.fillRect(i % size, Math.floor(i / size), 1, 1);
                }
                const data = context.getImageData(0, 0, size, size).data;
                for (let i = 0; i < size * size * 4; i++) {
                    if (i % 4 !== 3 && data[i] !== i) {
                        useVideoFrame = true;
                        break;
                    }
                }
            }
        }
    }
    return useVideoFrame || false;
}
function withTimeout(timeoutMs, value, abortController) {
    let reject = () => { };
    const timeout = setTimeout(() => {
        reject(new Error("timed out"));
        abortController === null || abortController === void 0 ? void 0 : abortController.abort();
    }, timeoutMs);
    onAbort(abortController, () => {
        reject(new Error("aborted"));
        clearTimeout(timeout);
    });
    const cancelPromise = new Promise((_, rej) => {
        reject = rej;
    });
    return Promise.race([
        cancelPromise,
        value.finally(() => clearTimeout(timeout)),
    ]);
}
function onAbort(abortController, action) {
    if (action) {
        abortController === null || abortController === void 0 ? void 0 : abortController.signal.addEventListener("abort", action);
    }
}
function isAborted(abortController) {
    var _a;
    return Boolean((_a = abortController === null || abortController === void 0 ? void 0 : abortController.signal) === null || _a === void 0 ? void 0 : _a.aborted);
}

let num = 0;
/**
 * LRU Cache for CancelablePromises.
 * The underlying request is only canceled when all callers have canceled their usage of it.
 */
class AsyncCache {
    constructor(maxSize = 100) {
        this.size = () => this.items.size;
        this.get = (key, supplier, abortController) => {
            let result = this.items.get(key);
            if (!result) {
                const sharedAbortController = new AbortController();
                const value = supplier(key, sharedAbortController);
                result = {
                    abortController: sharedAbortController,
                    item: value,
                    lastUsed: ++num,
                    waiting: 1,
                };
                this.items.set(key, result);
                this.prune();
            }
            else {
                result.lastUsed = ++num;
                result.waiting++;
            }
            const items = this.items;
            const value = result.item.then((r) => r, (e) => {
                items.delete(key);
                return Promise.reject(e);
            });
            let canceled = false;
            onAbort(abortController, () => {
                var _a;
                if (result && result.abortController && !canceled) {
                    canceled = true;
                    if (--result.waiting <= 0) {
                        (_a = result.abortController) === null || _a === void 0 ? void 0 : _a.abort();
                        items.delete(key);
                    }
                }
            });
            return value;
        };
        this.clear = () => this.items.clear();
        this.maxSize = maxSize;
        this.items = new Map();
    }
    prune() {
        if (this.items.size > this.maxSize) {
            let minKey;
            let minUse = Infinity;
            this.items.forEach((value, key) => {
                if (value.lastUsed < minUse) {
                    minUse = value.lastUsed;
                    minKey = key;
                }
            });
            if (typeof minKey !== "undefined") {
                this.items.delete(minKey);
            }
        }
    }
}

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x$1 = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x$1 = ((x$1 & 0xCCCC) >> 2) | ((x$1 & 0x3333) << 2);
    x$1 = ((x$1 & 0xF0F0) >> 4) | ((x$1 & 0x0F0F) << 4);
    rev[i] = (((x$1 & 0xFF00) >> 8) | ((x$1 & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    ,
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// empty
var et = /*#__PURE__*/ new u8(0);
// gzip footer: -8 to -4 = CRC, -4 to -0 is length
// gzip start
var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8)
        err(6, 'invalid gzip data');
    var flg = d[3];
    var st = 10;
    if (flg & 4)
        st += (d[10] | d[11] << 8) + 2;
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
        ;
    return st + (flg & 2);
};
// gzip length
var gzl = function (d) {
    var l = d.length;
    return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
// zlib start
var zls = function (d, dict) {
    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if ((d[1] >> 5 & 1) == +!dict)
        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
    return (d[1] >> 3 & 4) + 2;
};
/**
 * Expands DEFLATE data with no wrapper
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts, opts);
}
/**
 * Expands GZIP data
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length)
        err(6, 'invalid gzip data');
    return inflt(data.subarray(st, -8), { i: 2 }, new u8(gzl(data)), opts);
}
/**
 * Expands Zlib data
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data, opts), -4), { i: 2 }, opts, opts);
}
/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function decompressSync(data, opts) {
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzipSync(data, opts)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflateSync(data, opts)
            : unzlibSync(data, opts);
}
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }

var z=Object.defineProperty;var b=Math.pow;var l=(i,e)=>z(i,"name",{value:e,configurable:!0});var m=(i,e,t)=>new Promise((r,n)=>{var s=u=>{try{a(t.next(u));}catch(c){n(c);}},o=u=>{try{a(t.throw(u));}catch(c){n(c);}},a=u=>u.done?r(u.value):Promise.resolve(u.value).then(s,o);a((t=t.apply(i,e)).next());});l((i,e)=>{let t=!1,r="",n=L.GridLayer.extend({createTile:l((s,o)=>{let a=document.createElement("img"),u=new AbortController,c=u.signal;return a.cancel=()=>{u.abort();},t||(i.getHeader().then(d=>{d.tileType===1?console.error("Error: archive contains MVT vector tiles, but leafletRasterLayer is for displaying raster tiles. See https://github.com/protomaps/PMTiles/tree/main/js for details."):d.tileType===2?r="image/png":d.tileType===3?r="image/jpeg":d.tileType===4?r="image/webp":d.tileType===5&&(r="image/avif");}),t=!0),i.getZxy(s.z,s.x,s.y,c).then(d=>{if(d){let h=new Blob([d.data],{type:r}),g=window.URL.createObjectURL(h);a.src=g,a.cancel=void 0,o(void 0,a);}}).catch(d=>{if(d.name!=="AbortError")throw d}),a},"createTile"),_removeTile:l(function(s){let o=this._tiles[s];o&&(o.el.cancel&&o.el.cancel(),o.el.width=0,o.el.height=0,o.el.deleted=!0,L.DomUtil.remove(o.el),delete this._tiles[s],this.fire("tileunload",{tile:o.el,coords:this._keyToTileCoords(s)}));},"_removeTile")});return new n(e)},"leafletRasterLayer");var j=l(i=>(e,t)=>{if(t instanceof AbortController)return i(e,t);let r=new AbortController;return i(e,r).then(n=>t(void 0,n.data,n.cacheControl||"",n.expires||""),n=>t(n)).catch(n=>t(n)),{cancel:l(()=>r.abort(),"cancel")}},"v3compat"),T=class T{constructor(e){this.tilev4=l((e,t)=>m(this,null,function*(){if(e.type==="json"){let g=e.url.substr(10),p=this.tiles.get(g);if(p||(p=new x(g),this.tiles.set(g,p)),this.metadata)return {data:yield p.getTileJson(e.url)};let y=yield p.getHeader();return {data:{tiles:[`${e.url}/{z}/{x}/{y}`],minzoom:y.minZoom,maxzoom:y.maxZoom,bounds:[y.minLon,y.minLat,y.maxLon,y.maxLat]}}}let r=new RegExp(/pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/),n=e.url.match(r);if(!n)throw new Error("Invalid PMTiles protocol URL");let s=n[1],o=this.tiles.get(s);o||(o=new x(s),this.tiles.set(s,o));let a=n[2],u=n[3],c=n[4],d=yield o.getHeader(),h=yield o==null?void 0:o.getZxy(+a,+u,+c,t.signal);if(h)return {data:new Uint8Array(h.data),cacheControl:h.cacheControl,expires:h.expires};if(d.tileType===1){if(this.errorOnMissingTile)throw new Error("Tile not found.");return {data:new Uint8Array}}return {data:null}}),"tilev4");this.tile=j(this.tilev4);this.tiles=new Map,this.metadata=(e==null?void 0:e.metadata)||!1,this.errorOnMissingTile=(e==null?void 0:e.errorOnMissingTile)||!1;}add(e){this.tiles.set(e.source.getKey(),e);}get(e){return this.tiles.get(e)}};l(T,"Protocol");function w(i,e){return (e>>>0)*4294967296+(i>>>0)}l(w,"toNum");function F(i,e){let t=e.buf,r=t[e.pos++],n=(r&112)>>4;if(r<128||(r=t[e.pos++],n|=(r&127)<<3,r<128)||(r=t[e.pos++],n|=(r&127)<<10,r<128)||(r=t[e.pos++],n|=(r&127)<<17,r<128)||(r=t[e.pos++],n|=(r&127)<<24,r<128)||(r=t[e.pos++],n|=(r&1)<<31,r<128))return w(i,n);throw new Error("Expected varint not more than 10 bytes")}l(F,"readVarintRemainder");function v(i){let e=i.buf,t=e[i.pos++],r=t&127;return t<128||(t=e[i.pos++],r|=(t&127)<<7,t<128)||(t=e[i.pos++],r|=(t&127)<<14,t<128)||(t=e[i.pos++],r|=(t&127)<<21,t<128)?r:(t=e[i.pos],r|=(t&15)<<28,F(r,i))}l(v,"readVarint");function Z(i,e,t,r){if(r===0){t===1&&(e[0]=i-1-e[0],e[1]=i-1-e[1]);let n=e[0];e[0]=e[1],e[1]=n;}}l(Z,"rotate");function N(i,e){let t=b(2,i),r=e,n=e,s=e,o=[0,0],a=1;for(;a<t;)r=1&s/2,n=1&(s^r),Z(a,o,r,n),o[0]+=a*r,o[1]+=a*n,s=s/4,a*=2;return [i,o[0],o[1]]}l(N,"idOnLevel");var q=[0,1,5,21,85,341,1365,5461,21845,87381,349525,1398101,5592405,22369621,89478485,357913941,1431655765,5726623061,22906492245,91625968981,366503875925,1466015503701,5864062014805,23456248059221,93824992236885,375299968947541,0x5555555555555];function G(i,e,t){if(i>26)throw new Error("Tile zoom level exceeds max safe number limit (26)");if(e>b(2,i)-1||t>b(2,i)-1)throw new Error("tile x/y outside zoom level bounds");let r=q[i],n=b(2,i),s=0,o=0,a=0,u=[e,t],c=n/2;for(;c>0;)s=(u[0]&c)>0?1:0,o=(u[1]&c)>0?1:0,a+=c*c*(3*s^o),Z(c,u,s,o),c=c/2;return r+a}l(G,"zxyToTileId");function ie(i){let e=0;for(let r=0;r<27;r++){let n=(1<<r)*(1<<r);if(e+n>i)return N(r,i-e);e+=n;}throw new Error("Tile zoom level exceeds max safe number limit (26)")}l(ie,"tileIdToZxy");var J=(s=>(s[s.Unknown=0]="Unknown",s[s.None=1]="None",s[s.Gzip=2]="Gzip",s[s.Brotli=3]="Brotli",s[s.Zstd=4]="Zstd",s))(J||{});function D(i,e){return m(this,null,function*(){if(e===1||e===0)return i;if(e===2){if(typeof globalThis.DecompressionStream=="undefined")return decompressSync(new Uint8Array(i));let t=new Response(i).body;if(!t)throw new Error("Failed to read response stream");let r=t.pipeThrough(new globalThis.DecompressionStream("gzip"));return new Response(r).arrayBuffer()}throw new Error("Compression method not supported")})}l(D,"defaultDecompress");var O=(o=>(o[o.Unknown=0]="Unknown",o[o.Mvt=1]="Mvt",o[o.Png=2]="Png",o[o.Jpeg=3]="Jpeg",o[o.Webp=4]="Webp",o[o.Avif=5]="Avif",o))(O||{});function _(i){return i===1?".mvt":i===2?".png":i===3?".jpg":i===4?".webp":i===5?".avif":""}l(_,"tileTypeExt");var Y=127;function Q(i,e){let t=0,r=i.length-1;for(;t<=r;){let n=r+t>>1,s=e-i[n].tileId;if(s>0)t=n+1;else if(s<0)r=n-1;else return i[n]}return r>=0&&(i[r].runLength===0||e-i[r].tileId<i[r].runLength)?i[r]:null}l(Q,"findTile");var A=class A{constructor(e){this.file=e;}getKey(){return this.file.name}getBytes(e,t){return m(this,null,function*(){return {data:yield this.file.slice(e,e+t).arrayBuffer()}})}};l(A,"FileSource");var U=class U{constructor(e,t=new Headers){this.url=e,this.customHeaders=t,this.mustReload=!1;let r="";"navigator"in globalThis&&(r=globalThis.navigator.userAgent||"");let n=r.indexOf("Windows")>-1,s=/Chrome|Chromium|Edg|OPR|Brave/.test(r);this.chromeWindowsNoCache=!1,n&&s&&(this.chromeWindowsNoCache=!0);}getKey(){return this.url}setHeaders(e){this.customHeaders=e;}getBytes(e,t,r,n){return m(this,null,function*(){let s,o;r?o=r:(s=new AbortController,o=s.signal);let a=new Headers(this.customHeaders);a.set("range",`bytes=${e}-${e+t-1}`);let u;this.mustReload?u="reload":this.chromeWindowsNoCache&&(u="no-store");let c=yield fetch(this.url,{signal:o,cache:u,headers:a});if(e===0&&c.status===416){let p=c.headers.get("Content-Range");if(!p||!p.startsWith("bytes */"))throw new Error("Missing content-length on 416 response");let y=+p.substr(8);c=yield fetch(this.url,{signal:o,cache:"reload",headers:{range:`bytes=0-${y-1}`}});}let d=c.headers.get("Etag");if(d!=null&&d.startsWith("W/")&&(d=null),c.status===416||n&&d&&d!==n)throw this.mustReload=!0,new E(`Server returned non-matching ETag ${n} after one retry. Check browser extensions and servers for issues that may affect correct ETag headers.`);if(c.status>=300)throw new Error(`Bad response code: ${c.status}`);let h=c.headers.get("Content-Length");if(c.status===200&&(!h||+h>t))throw s&&s.abort(),new Error("Server returned no content-length header or content-length exceeding request. Check that your storage backend supports HTTP Byte Serving.");return {data:yield c.arrayBuffer(),etag:d||void 0,cacheControl:c.headers.get("Cache-Control")||void 0,expires:c.headers.get("Expires")||void 0}})}};l(U,"FetchSource");var C=U;function f(i,e){let t=i.getUint32(e+4,!0),r=i.getUint32(e+0,!0);return t*b(2,32)+r}l(f,"getUint64");function X(i,e){let t=new DataView(i),r=t.getUint8(7);if(r>3)throw new Error(`Archive is spec version ${r} but this library supports up to spec version 3`);return {specVersion:r,rootDirectoryOffset:f(t,8),rootDirectoryLength:f(t,16),jsonMetadataOffset:f(t,24),jsonMetadataLength:f(t,32),leafDirectoryOffset:f(t,40),leafDirectoryLength:f(t,48),tileDataOffset:f(t,56),tileDataLength:f(t,64),numAddressedTiles:f(t,72),numTileEntries:f(t,80),numTileContents:f(t,88),clustered:t.getUint8(96)===1,internalCompression:t.getUint8(97),tileCompression:t.getUint8(98),tileType:t.getUint8(99),minZoom:t.getUint8(100),maxZoom:t.getUint8(101),minLon:t.getInt32(102,!0)/1e7,minLat:t.getInt32(106,!0)/1e7,maxLon:t.getInt32(110,!0)/1e7,maxLat:t.getInt32(114,!0)/1e7,centerZoom:t.getUint8(118),centerLon:t.getInt32(119,!0)/1e7,centerLat:t.getInt32(123,!0)/1e7,etag:e}}l(X,"bytesToHeader");function $(i){let e={buf:new Uint8Array(i),pos:0},t=v(e),r=[],n=0;for(let s=0;s<t;s++){let o=v(e);r.push({tileId:n+o,offset:0,length:0,runLength:1}),n+=o;}for(let s=0;s<t;s++)r[s].runLength=v(e);for(let s=0;s<t;s++)r[s].length=v(e);for(let s=0;s<t;s++){let o=v(e);o===0&&s>0?r[s].offset=r[s-1].offset+r[s-1].length:r[s].offset=o-1;}return r}l($,"deserializeIndex");var R=class R extends Error{};l(R,"EtagMismatch");var E=R;function K(i,e){return m(this,null,function*(){let t=yield i.getBytes(0,16384);if(new DataView(t.data).getUint16(0,!0)!==19792)throw new Error("Wrong magic number for PMTiles archive");let n=t.data.slice(0,Y),s=X(n,t.etag),o=t.data.slice(s.rootDirectoryOffset,s.rootDirectoryOffset+s.rootDirectoryLength),a=`${i.getKey()}|${s.etag||""}|${s.rootDirectoryOffset}|${s.rootDirectoryLength}`,u=$(yield e(o,s.internalCompression));return [s,[a,u.length,u]]})}l(K,"getHeaderAndRoot");function I(i,e,t,r,n){return m(this,null,function*(){let s=yield i.getBytes(t,r,void 0,n.etag),o=yield e(s.data,n.internalCompression),a=$(o);if(a.length===0)throw new Error("Empty directory is invalid");return a})}l(I,"getDirectory");var H=class H{constructor(e=100,t=!0,r=D){this.cache=new Map,this.maxCacheEntries=e,this.counter=1,this.decompress=r;}getHeader(e){return m(this,null,function*(){let t=e.getKey(),r=this.cache.get(t);if(r)return r.lastUsed=this.counter++,r.data;let n=yield K(e,this.decompress);return n[1]&&this.cache.set(n[1][0],{lastUsed:this.counter++,data:n[1][2]}),this.cache.set(t,{lastUsed:this.counter++,data:n[0]}),this.prune(),n[0]})}getDirectory(e,t,r,n){return m(this,null,function*(){let s=`${e.getKey()}|${n.etag||""}|${t}|${r}`,o=this.cache.get(s);if(o)return o.lastUsed=this.counter++,o.data;let a=yield I(e,this.decompress,t,r,n);return this.cache.set(s,{lastUsed:this.counter++,data:a}),this.prune(),a})}prune(){if(this.cache.size>this.maxCacheEntries){let e=1/0,t;this.cache.forEach((r,n)=>{r.lastUsed<e&&(e=r.lastUsed,t=n);}),t&&this.cache.delete(t);}}invalidate(e){return m(this,null,function*(){this.cache.delete(e.getKey());})}};l(H,"ResolvedValueCache");var M=class M{constructor(e=100,t=!0,r=D){this.cache=new Map,this.invalidations=new Map,this.maxCacheEntries=e,this.counter=1,this.decompress=r;}getHeader(e){return m(this,null,function*(){let t=e.getKey(),r=this.cache.get(t);if(r)return r.lastUsed=this.counter++,yield r.data;let n=new Promise((s,o)=>{K(e,this.decompress).then(a=>{a[1]&&this.cache.set(a[1][0],{lastUsed:this.counter++,data:Promise.resolve(a[1][2])}),s(a[0]),this.prune();}).catch(a=>{o(a);});});return this.cache.set(t,{lastUsed:this.counter++,data:n}),n})}getDirectory(e,t,r,n){return m(this,null,function*(){let s=`${e.getKey()}|${n.etag||""}|${t}|${r}`,o=this.cache.get(s);if(o)return o.lastUsed=this.counter++,yield o.data;let a=new Promise((u,c)=>{I(e,this.decompress,t,r,n).then(d=>{u(d),this.prune();}).catch(d=>{c(d);});});return this.cache.set(s,{lastUsed:this.counter++,data:a}),a})}prune(){if(this.cache.size>=this.maxCacheEntries){let e=1/0,t;this.cache.forEach((r,n)=>{r.lastUsed<e&&(e=r.lastUsed,t=n);}),t&&this.cache.delete(t);}}invalidate(e){return m(this,null,function*(){let t=e.getKey();if(this.invalidations.get(t))return yield this.invalidations.get(t);this.cache.delete(e.getKey());let r=new Promise((n,s)=>{this.getHeader(e).then(o=>{n(),this.invalidations.delete(t);}).catch(o=>{s(o);});});this.invalidations.set(t,r);})}};l(M,"SharedPromiseCache");var P=M,B=class B{constructor(e,t,r){typeof e=="string"?this.source=new C(e):this.source=e,r?this.decompress=r:this.decompress=D,t?this.cache=t:this.cache=new P;}getHeader(){return m(this,null,function*(){return yield this.cache.getHeader(this.source)})}getZxyAttempt(e,t,r,n){return m(this,null,function*(){let s=G(e,t,r),o=yield this.cache.getHeader(this.source);if(e<o.minZoom||e>o.maxZoom)return;let a=o.rootDirectoryOffset,u=o.rootDirectoryLength;for(let c=0;c<=3;c++){let d=yield this.cache.getDirectory(this.source,a,u,o),h=Q(d,s);if(h){if(h.runLength>0){let g=yield this.source.getBytes(o.tileDataOffset+h.offset,h.length,n,o.etag);return {data:yield this.decompress(g.data,o.tileCompression),cacheControl:g.cacheControl,expires:g.expires}}a=o.leafDirectoryOffset+h.offset,u=h.length;}else return}throw new Error("Maximum directory depth exceeded")})}getZxy(e,t,r,n){return m(this,null,function*(){try{return yield this.getZxyAttempt(e,t,r,n)}catch(s){if(s instanceof E)return this.cache.invalidate(this.source),yield this.getZxyAttempt(e,t,r,n);throw s}})}getMetadataAttempt(){return m(this,null,function*(){let e=yield this.cache.getHeader(this.source),t=yield this.source.getBytes(e.jsonMetadataOffset,e.jsonMetadataLength,void 0,e.etag),r=yield this.decompress(t.data,e.internalCompression),n=new TextDecoder("utf-8");return JSON.parse(n.decode(r))})}getMetadata(){return m(this,null,function*(){try{return yield this.getMetadataAttempt()}catch(e){if(e instanceof E)return this.cache.invalidate(this.source),yield this.getMetadataAttempt();throw e}})}getTileJson(e){return m(this,null,function*(){let t=yield this.getHeader(),r=yield this.getMetadata(),n=_(t.tileType);return {tilejson:"3.0.0",scheme:"xyz",tiles:[`${e}/{z}/{x}/{y}${n}`],vector_layers:r.vector_layers,attribution:r.attribution,description:r.description,name:r.name,version:r.version,bounds:[t.minLon,t.minLat,t.maxLon,t.maxLat],center:[t.centerLon,t.centerLat,t.centerZoom],minzoom:t.minZoom,maxzoom:t.maxZoom}})}};l(B,"PMTiles");var x=B;

function openPMtiles(FilePath) {
    const source = new C(FilePath);
    const pmtiles = new x(source);
    return pmtiles;
}
function getPMtilesTile(pmtiles, z, x, y) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const zxyTile = yield pmtiles.getZxy(z, x, y);
            if (zxyTile && zxyTile.data) {
                return { data: zxyTile.data };
            }
            else {
                return { data: undefined };
            }
        }
        catch (error) {
            console.error("Error fetching tile:", error);
            return { data: undefined };
        }
    });
}
function GetImageData(
// eslint-disable-next-line @typescript-eslint/no-unused-vars
blob, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
encoding) {
    return __awaiter(this, void 0, void 0, function* () {
        return undefined;
    });
}

let offscreenCanvas;
let offscreenContext;
let canvas;
let canvasContext;
function decodeImageNode(blob, encoding, abortController) {
    return __awaiter(this, void 0, void 0, function* () {
        const img = yield GetImageData();
        if (isAborted(abortController))
            return null;
        return img;
    });
}
/**
 * Parses a `raster-dem` image into a DemTile using Webcoded VideoFrame API.
 */
function decodeImageModern(blob, encoding, abortController) {
    return __awaiter(this, void 0, void 0, function* () {
        const img = yield createImageBitmap(blob);
        if (isAborted(abortController))
            return null;
        return decodeImageUsingOffscreenCanvas(img, encoding);
    });
}
function decodeImageUsingOffscreenCanvas(img, encoding) {
    if (!offscreenCanvas) {
        offscreenCanvas = new OffscreenCanvas(img.width, img.height);
        offscreenContext = offscreenCanvas.getContext("2d", {
            willReadFrequently: true,
        });
    }
    return getElevations(img, encoding, offscreenCanvas, offscreenContext);
}
/**
 * Parses a `raster-dem` image into a DemTile using webcodec VideoFrame API which works
 * even when browsers disable/degrade the canvas getImageData API as a privacy protection.
 */
function decodeImageVideoFrame(blob, encoding, abortController) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const img = yield createImageBitmap(blob);
        if (isAborted(abortController))
            return null;
        const vf = new VideoFrame(img, { timestamp: 0 });
        try {
            // formats we can handle: BGRX, BGRA, RGBA, RGBX
            const valid = ((_a = vf === null || vf === void 0 ? void 0 : vf.format) === null || _a === void 0 ? void 0 : _a.startsWith("BGR")) || ((_b = vf === null || vf === void 0 ? void 0 : vf.format) === null || _b === void 0 ? void 0 : _b.startsWith("RGB"));
            if (!valid) {
                throw new Error(`Unrecognized format: ${vf === null || vf === void 0 ? void 0 : vf.format}`);
            }
            const swapBR = (_c = vf === null || vf === void 0 ? void 0 : vf.format) === null || _c === void 0 ? void 0 : _c.startsWith("BGR");
            const size = vf.allocationSize();
            const data = new Uint8ClampedArray(size);
            yield vf.copyTo(data);
            if (swapBR) {
                for (let i = 0; i < data.length; i += 4) {
                    const tmp = data[i];
                    data[i] = data[i + 2];
                    data[i + 2] = tmp;
                }
            }
            return decodeParsedImage(img.width, img.height, encoding, data);
        }
        catch (_) {
            if (isAborted(abortController))
                return null;
            // fall back to offscreen canvas
            return decodeImageUsingOffscreenCanvas(img, encoding);
        }
        finally {
            vf.close();
        }
    });
}
/**
 * Parses a `raster-dem` image into a DemTile using `<img>` element drawn to a `<canvas>`.
 * Only works on the main thread, but works across all browsers.
 */
function decodeImageOld(blob, encoding, abortController) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvasContext = canvas.getContext("2d", {
                willReadFrequently: true,
            });
        }
        const img = new Image();
        onAbort(abortController, () => (img.src = ""));
        const fetchedImage = yield new Promise((resolve, reject) => {
            img.onload = () => {
                if (!isAborted(abortController))
                    resolve(img);
                URL.revokeObjectURL(img.src);
                img.onload = null;
            };
            img.onerror = () => reject(new Error("Could not load image."));
            img.src = blob.size ? URL.createObjectURL(blob) : "";
        });
        return getElevations(fetchedImage, encoding, canvas, canvasContext);
    });
}
/**
 * Parses a `raster-dem` image in a worker that doesn't support OffscreenCanvas and createImageBitmap
 * by running decodeImageOld on the main thread and returning the result.
 */
function decodeImageOnMainThread(blob, encoding, abortController) {
    return self.actor.send("decodeImage", [], abortController, undefined, blob, encoding);
}
function isWorker() {
    return (
    // @ts-expect-error WorkerGlobalScope defined
    typeof WorkerGlobalScope !== "undefined" &&
        typeof self !== "undefined" &&
        // @ts-expect-error WorkerGlobalScope defined
        self instanceof WorkerGlobalScope);
}
const defaultDecoder = shouldUseVideoFrame()
    ? decodeImageVideoFrame
    : offscreenCanvasSupported()
        ? decodeImageModern
        : isWorker()
            ? decodeImageOnMainThread
            : typeof document !== "undefined"
                ? decodeImageOld
                : decodeImageNode;
function getElevations(img, encoding, canvas, canvasContext) {
    canvas.width = img.width;
    canvas.height = img.height;
    if (!canvasContext)
        throw new Error("failed to get context");
    canvasContext.drawImage(img, 0, 0, img.width, img.height);
    const rgba = canvasContext.getImageData(0, 0, img.width, img.height).data;
    return decodeParsedImage(img.width, img.height, encoding, rgba);
}
function decodeParsedImage(width, height, encoding, input) {
    const decoder = encoding === "mapbox"
        ? (r, g, b) => -10000 + (r * 256 * 256 + g * 256 + b) * 0.1
        : (r, g, b) => r * 256 + g + b / 256 - 32768;
    const data = new Float32Array(width * height);
    for (let i = 0; i < input.length; i += 4) {
        data[i / 4] = decoder(input[i], input[i + 1], input[i + 2]);
    }
    return { width, height, data };
}

const MIN_VALID_M = -12000;
const MAX_VALID_M = 9000;
function defaultIsValid(number) {
    return !isNaN(number) && number >= MIN_VALID_M && number <= MAX_VALID_M;
}
/** A tile containing elevation values aligned to a grid. */
class HeightTile {
    constructor(width, height, get) {
        /**
         * Splits this tile into a `1<<subz` x `1<<subz` grid and returns the tile at coordinates `subx, suby`.
         */
        this.split = (subz, subx, suby) => {
            if (subz === 0)
                return this;
            const by = 1 << subz;
            const dx = (subx * this.width) / by;
            const dy = (suby * this.height) / by;
            return new HeightTile(this.width / by, this.height / by, (x, y) => this.get(x + dx, y + dy));
        };
        /**
         * Returns a new tile scaled up by `factor` with pixel values that are subsampled using
         * bilinear interpolation between the original height tile values.
         *
         * The original and result tile are assumed to represent values taken at the center of each pixel.
         */
        this.subsamplePixelCenters = (factor) => {
            const lerp = (a, b, f) => isNaN(a) ? b : isNaN(b) ? a : a + (b - a) * f;
            if (factor <= 1)
                return this;
            const sub = 0.5 - 1 / (2 * factor);
            const blerper = (x, y) => {
                const dx = x / factor - sub;
                const dy = y / factor - sub;
                const ox = Math.floor(dx);
                const oy = Math.floor(dy);
                const a = this.get(ox, oy);
                const b = this.get(ox + 1, oy);
                const c = this.get(ox, oy + 1);
                const d = this.get(ox + 1, oy + 1);
                const fx = dx - ox;
                const fy = dy - oy;
                const top = lerp(a, b, fx);
                const bottom = lerp(c, d, fx);
                return lerp(top, bottom, fy);
            };
            return new HeightTile(this.width * factor, this.height * factor, blerper);
        };
        /**
         * Assumes the input tile represented measurements taken at the center of each pixel, and
         * returns a new tile where values are the height at the top-left of each pixel by averaging
         * the 4 adjacent pixel values.
         */
        this.averagePixelCentersToGrid = (radius = 1) => new HeightTile(this.width + 1, this.height + 1, (x, y) => {
            let sum = 0, count = 0, v = 0;
            for (let newX = x - radius; newX < x + radius; newX++) {
                for (let newY = y - radius; newY < y + radius; newY++) {
                    if (!isNaN((v = this.get(newX, newY)))) {
                        count++;
                        sum += v;
                    }
                }
            }
            return count === 0 ? NaN : sum / count;
        });
        /** Returns a new tile with elevation values scaled by `multiplier`. */
        this.scaleElevation = (multiplier) => multiplier === 1
            ? this
            : new HeightTile(this.width, this.height, (x, y) => this.get(x, y) * multiplier);
        /**
         * Precompute every value from `-bufer, -buffer` to `width + buffer, height + buffer` and serve them
         * out of a `Float32Array`. Until this method is called, all `get` requests are lazy and call all previous
         * methods in the chain up to the root DEM tile.
         */
        this.materialize = (buffer = 2) => {
            const stride = this.width + 2 * buffer;
            const data = new Float32Array(stride * (this.height + 2 * buffer));
            let idx = 0;
            for (let y = -buffer; y < this.height + buffer; y++) {
                for (let x = -buffer; x < this.width + buffer; x++) {
                    data[idx++] = this.get(x, y);
                }
            }
            return new HeightTile(this.width, this.height, (x, y) => data[(y + buffer) * stride + x + buffer]);
        };
        this.get = get;
        this.width = width;
        this.height = height;
    }
    /** Construct a height tile from raw DEM pixel values */
    static fromRawDem(demTile) {
        return new HeightTile(demTile.width, demTile.height, (x, y) => {
            const value = demTile.data[y * demTile.width + x];
            return defaultIsValid(value) ? value : NaN;
        });
    }
    /**
     * Construct a height tile from a DEM tile plus it's 8 neighbors, so that
     * you can request `x` or `y` outside the bounds of the original tile.
     *
     * @param neighbors An array containing tiles: `[nw, n, ne, w, c, e, sw, s, se]`
     */
    static combineNeighbors(neighbors) {
        if (neighbors.length !== 9) {
            throw new Error("Must include a tile plus 8 neighbors");
        }
        const mainTile = neighbors[4];
        if (!mainTile) {
            return undefined;
        }
        const width = mainTile.width;
        const height = mainTile.height;
        return new HeightTile(width, height, (x, y) => {
            let gridIdx = 0;
            if (y < 0) {
                y += height;
            }
            else if (y < height) {
                gridIdx += 3;
            }
            else {
                y -= height;
                gridIdx += 6;
            }
            if (x < 0) {
                x += width;
            }
            else if (x < width) {
                gridIdx += 1;
            }
            else {
                x -= width;
                gridIdx += 2;
            }
            const grid = neighbors[gridIdx];
            return grid ? grid.get(x, y) : NaN;
        });
    }
}

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16);
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
const TEXT_DECODER_MIN_LENGTH = 12;
const utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8');

const PBF_VARINT  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
const PBF_FIXED64 = 1; // 64-bit: double, fixed64, sfixed64
const PBF_BYTES   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
const PBF_FIXED32 = 5; // 32-bit: float, fixed32, sfixed32

class Pbf {
    /**
     * @param {Uint8Array | ArrayBuffer} [buf]
     */
    constructor(buf = new Uint8Array(16)) {
        this.buf = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf);
        this.dataView = new DataView(this.buf.buffer);
        this.pos = 0;
        this.type = 0;
        this.length = this.buf.length;
    }

    // === READING =================================================================

    /**
     * @template T
     * @param {(tag: number, result: T, pbf: Pbf) => void} readField
     * @param {T} result
     * @param {number} [end]
     */
    readFields(readField, result, end = this.length) {
        while (this.pos < end) {
            const val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    }

    /**
     * @template T
     * @param {(tag: number, result: T, pbf: Pbf) => void} readField
     * @param {T} result
     */
    readMessage(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    }

    readFixed32() {
        const val = this.dataView.getUint32(this.pos, true);
        this.pos += 4;
        return val;
    }

    readSFixed32() {
        const val = this.dataView.getInt32(this.pos, true);
        this.pos += 4;
        return val;
    }

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64() {
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getUint32(this.pos + 4, true) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    }

    readSFixed64() {
        const val = this.dataView.getUint32(this.pos, true) + this.dataView.getInt32(this.pos + 4, true) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    }

    readFloat() {
        const val = this.dataView.getFloat32(this.pos, true);
        this.pos += 4;
        return val;
    }

    readDouble() {
        const val = this.dataView.getFloat64(this.pos, true);
        this.pos += 8;
        return val;
    }

    /**
     * @param {boolean} [isSigned]
     */
    readVarint(isSigned) {
        const buf = this.buf;
        let val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder(val, isSigned, this);
    }

    readVarint64() { // for compatibility with v2.0.1
        return this.readVarint(true);
    }

    readSVarint() {
        const num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    }

    readBoolean() {
        return Boolean(this.readVarint());
    }

    readString() {
        const end = this.readVarint() + this.pos;
        const pos = this.pos;
        this.pos = end;

        if (end - pos >= TEXT_DECODER_MIN_LENGTH && utf8TextDecoder) {
            // longer strings are fast with the built-in browser TextDecoder API
            return utf8TextDecoder.decode(this.buf.subarray(pos, end));
        }
        // short strings are fast with our custom implementation
        return readUtf8(this.buf, pos, end);
    }

    readBytes() {
        const end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    }

    // verbose for performance reasons; doesn't affect gzipped size

    /**
     * @param {number[]} [arr]
     * @param {boolean} [isSigned]
     */
    readPackedVarint(arr = [], isSigned) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSVarint(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    }
    /** @param {boolean[]} [arr] */
    readPackedBoolean(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFloat(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedDouble(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFixed32(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSFixed32(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedFixed64(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    }
    /** @param {number[]} [arr] */
    readPackedSFixed64(arr = []) {
        const end = this.readPackedEnd();
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    }
    readPackedEnd() {
        return this.type === PBF_BYTES ? this.readVarint() + this.pos : this.pos + 1;
    }

    /** @param {number} val */
    skip(val) {
        const type = val & 0x7;
        if (type === PBF_VARINT) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === PBF_BYTES) this.pos = this.readVarint() + this.pos;
        else if (type === PBF_FIXED32) this.pos += 4;
        else if (type === PBF_FIXED64) this.pos += 8;
        else throw new Error(`Unimplemented type: ${type}`);
    }

    // === WRITING =================================================================

    /**
     * @param {number} tag
     * @param {number} type
     */
    writeTag(tag, type) {
        this.writeVarint((tag << 3) | type);
    }

    /** @param {number} min */
    realloc(min) {
        let length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            const buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.dataView = new DataView(buf.buffer);
            this.length = length;
        }
    }

    finish() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    }

    /** @param {number} val */
    writeFixed32(val) {
        this.realloc(4);
        this.dataView.setInt32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeSFixed32(val) {
        this.realloc(4);
        this.dataView.setInt32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeFixed64(val) {
        this.realloc(8);
        this.dataView.setInt32(this.pos, val & -1, true);
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeSFixed64(val) {
        this.realloc(8);
        this.dataView.setInt32(this.pos, val & -1, true);
        this.dataView.setInt32(this.pos + 4, Math.floor(val * SHIFT_RIGHT_32), true);
        this.pos += 8;
    }

    /** @param {number} val */
    writeVarint(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    }

    /** @param {number} val */
    writeSVarint(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    }

    /** @param {boolean} val */
    writeBoolean(val) {
        this.writeVarint(+val);
    }

    /** @param {string} str */
    writeString(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        const startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8(this.buf, str, this.pos);
        const len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    }

    /** @param {number} val */
    writeFloat(val) {
        this.realloc(4);
        this.dataView.setFloat32(this.pos, val, true);
        this.pos += 4;
    }

    /** @param {number} val */
    writeDouble(val) {
        this.realloc(8);
        this.dataView.setFloat64(this.pos, val, true);
        this.pos += 8;
    }

    /** @param {Uint8Array} buffer */
    writeBytes(buffer) {
        const len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (let i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    }

    /**
     * @template T
     * @param {(obj: T, pbf: Pbf) => void} fn
     * @param {T} obj
     */
    writeRawMessage(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        const startPos = this.pos;
        fn(obj, this);
        const len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    }

    /**
     * @template T
     * @param {number} tag
     * @param {(obj: T, pbf: Pbf) => void} fn
     * @param {T} obj
     */
    writeMessage(tag, fn, obj) {
        this.writeTag(tag, PBF_BYTES);
        this.writeRawMessage(fn, obj);
    }

    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedVarint, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSVarint(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSVarint, arr);
    }
    /**
     * @param {number} tag
     * @param {boolean[]} arr
     */
    writePackedBoolean(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedBoolean, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFloat(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFloat, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedDouble(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedDouble, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed32, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed32(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed32, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedFixed64, arr);
    }
    /**
     * @param {number} tag
     * @param {number[]} arr
     */
    writePackedSFixed64(tag, arr) {
        if (arr.length) this.writeMessage(tag, writePackedSFixed64, arr);
    }

    /**
     * @param {number} tag
     * @param {Uint8Array} buffer
     */
    writeBytesField(tag, buffer) {
        this.writeTag(tag, PBF_BYTES);
        this.writeBytes(buffer);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed32Field(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeSFixed32(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSFixed64Field(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeSFixed64(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT);
        this.writeVarint(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeSVarintField(tag, val) {
        this.writeTag(tag, PBF_VARINT);
        this.writeSVarint(val);
    }
    /**
     * @param {number} tag
     * @param {string} str
     */
    writeStringField(tag, str) {
        this.writeTag(tag, PBF_BYTES);
        this.writeString(str);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeFloatField(tag, val) {
        this.writeTag(tag, PBF_FIXED32);
        this.writeFloat(val);
    }
    /**
     * @param {number} tag
     * @param {number} val
     */
    writeDoubleField(tag, val) {
        this.writeTag(tag, PBF_FIXED64);
        this.writeDouble(val);
    }
    /**
     * @param {number} tag
     * @param {boolean} val
     */
    writeBooleanField(tag, val) {
        this.writeVarintField(tag, +val);
    }
}
/**
 * @param {number} l
 * @param {boolean | undefined} s
 * @param {Pbf} p
 */
function readVarintRemainder(l, s, p) {
    const buf = p.buf;
    let h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

/**
 * @param {number} low
 * @param {number} high
 * @param {boolean} [isSigned]
 */
function toNum(low, high, isSigned) {
    return isSigned ? high * 0x100000000 + (low >>> 0) : ((high >>> 0) * 0x100000000) + (low >>> 0);
}

/**
 * @param {number} val
 * @param {Pbf} pbf
 */
function writeBigVarint(val, pbf) {
    let low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow(low, high, pbf);
    writeBigVarintHigh(high, pbf);
}

/**
 * @param {number} high
 * @param {number} low
 * @param {Pbf} pbf
 */
function writeBigVarintLow(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

/**
 * @param {number} high
 * @param {Pbf} pbf
 */
function writeBigVarintHigh(high, pbf) {
    const lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

/**
 * @param {number} startPos
 * @param {number} len
 * @param {Pbf} pbf
 */
function makeRoomForExtraLength(startPos, len, pbf) {
    const extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (let i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedVarint(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSVarint(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFloat(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedDouble(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);
}
/**
 * @param {boolean[]} arr
 * @param {Pbf} pbf
 */
function writePackedBoolean(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed32(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed32(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedFixed64(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);
}
/**
 * @param {number[]} arr
 * @param {Pbf} pbf
 */
function writePackedSFixed64(arr, pbf) {
    for (let i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]);
}

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

/**
 * @param {Uint8Array} buf
 * @param {number} pos
 * @param {number} end
 */
function readUtf8(buf, pos, end) {
    let str = '';
    let i = pos;

    while (i < end) {
        const b0 = buf[i];
        let c = null; // codepoint
        let bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        let b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

/**
 * @param {Uint8Array} buf
 * @param {string} str
 * @param {number} pos
 */
function writeUtf8(buf, str, pos) {
    for (let i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

/*
Adapted from vt-pbf https://github.com/mapbox/vt-pbf

The MIT License (MIT)

Copyright (c) 2015 Anand Thakker

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var GeomType;
(function (GeomType) {
    GeomType[GeomType["UNKNOWN"] = 0] = "UNKNOWN";
    GeomType[GeomType["POINT"] = 1] = "POINT";
    GeomType[GeomType["LINESTRING"] = 2] = "LINESTRING";
    GeomType[GeomType["POLYGON"] = 3] = "POLYGON";
})(GeomType || (GeomType = {}));
/**
 * Enodes and serializes a mapbox vector tile as an array of bytes.
 */
function encodeVectorTile(tile) {
    const pbf = new Pbf();
    for (const id in tile.layers) {
        const layer = tile.layers[id];
        if (!layer.extent) {
            layer.extent = tile.extent;
        }
        pbf.writeMessage(3, writeLayer, Object.assign(Object.assign({}, layer), { id }));
    }
    return pbf.finish();
}
function writeLayer(layer, pbf) {
    if (!pbf)
        throw new Error("pbf undefined");
    pbf.writeVarintField(15, 2);
    pbf.writeStringField(1, layer.id || "");
    pbf.writeVarintField(5, layer.extent || 4096);
    const context = {
        keys: [],
        values: [],
        keycache: {},
        valuecache: {},
    };
    for (const feature of layer.features) {
        context.feature = feature;
        pbf.writeMessage(2, writeFeature, context);
    }
    for (const key of context.keys) {
        pbf.writeStringField(3, key);
    }
    for (const value of context.values) {
        pbf.writeMessage(4, writeValue, value);
    }
}
function writeFeature(context, pbf) {
    const feature = context.feature;
    if (!feature || !pbf)
        throw new Error();
    pbf.writeMessage(2, writeProperties, context);
    pbf.writeVarintField(3, feature.type);
    pbf.writeMessage(4, writeGeometry, feature);
}
function writeProperties(context, pbf) {
    const feature = context.feature;
    if (!feature || !pbf)
        throw new Error();
    const keys = context.keys;
    const values = context.values;
    const keycache = context.keycache;
    const valuecache = context.valuecache;
    for (const key in feature.properties) {
        let value = feature.properties[key];
        let keyIndex = keycache[key];
        if (value === null)
            continue; // don't encode null value properties
        if (typeof keyIndex === "undefined") {
            keys.push(key);
            keyIndex = keys.length - 1;
            keycache[key] = keyIndex;
        }
        pbf.writeVarint(keyIndex);
        const type = typeof value;
        if (type !== "string" && type !== "boolean" && type !== "number") {
            value = JSON.stringify(value);
        }
        const valueKey = `${type}:${value}`;
        let valueIndex = valuecache[valueKey];
        if (typeof valueIndex === "undefined") {
            values.push(value);
            valueIndex = values.length - 1;
            valuecache[valueKey] = valueIndex;
        }
        pbf.writeVarint(valueIndex);
    }
}
function command(cmd, length) {
    return (length << 3) + (cmd & 0x7);
}
function zigzag(num) {
    return (num << 1) ^ (num >> 31);
}
function writeGeometry(feature, pbf) {
    if (!pbf)
        throw new Error();
    const geometry = feature.geometry;
    const type = feature.type;
    let x = 0;
    let y = 0;
    for (const ring of geometry) {
        let count = 1;
        if (type === GeomType.POINT) {
            count = ring.length / 2;
        }
        pbf.writeVarint(command(1, count)); // moveto
        // do not write polygon closing path as lineto
        const length = ring.length / 2;
        const lineCount = type === GeomType.POLYGON ? length - 1 : length;
        for (let i = 0; i < lineCount; i++) {
            if (i === 1 && type !== 1) {
                pbf.writeVarint(command(2, lineCount - 1)); // lineto
            }
            const dx = ring[i * 2] - x;
            const dy = ring[i * 2 + 1] - y;
            pbf.writeVarint(zigzag(dx));
            pbf.writeVarint(zigzag(dy));
            x += dx;
            y += dy;
        }
        if (type === GeomType.POLYGON) {
            pbf.writeVarint(command(7, 1)); // closepath
        }
    }
}
function writeValue(value, pbf) {
    if (!pbf)
        throw new Error();
    if (typeof value === "string") {
        pbf.writeStringField(1, value);
    }
    else if (typeof value === "boolean") {
        pbf.writeBooleanField(7, value);
    }
    else if (typeof value === "number") {
        if (value % 1 !== 0) {
            pbf.writeDoubleField(3, value);
        }
        else if (value < 0) {
            pbf.writeSVarintField(6, value);
        }
        else {
            pbf.writeVarintField(5, value);
        }
    }
}

const perf = typeof performance !== "undefined" ? performance : undefined;
const timeOrigin = perf
    ? perf.timeOrigin || new Date().getTime() - perf.now()
    : new Date().getTime();
function getResourceTiming(url) {
    var _a;
    return JSON.parse(JSON.stringify(((_a = perf === null || perf === void 0 ? void 0 : perf.getEntriesByName) === null || _a === void 0 ? void 0 : _a.call(perf, url)) || []));
}
function now() {
    return perf ? perf.now() : new Date().getTime();
}
function flatten(input) {
    const result = [];
    for (const list of input) {
        result.push(...list);
    }
    return result;
}
/** Utility for tracking how long tiles take to generate, and where the time is going. */
class Timer {
    constructor(name) {
        this.marks = {};
        this.urls = [];
        this.fetched = [];
        this.resources = [];
        this.tilesFetched = 0;
        this.timeOrigin = timeOrigin;
        this.finish = (url) => {
            this.markFinish();
            const get = (type) => {
                const all = this.marks[type] || [];
                const max = Math.max(...all.map((ns) => Math.max(...ns)));
                const min = Math.min(...all.map((ns) => Math.min(...ns)));
                return Number.isFinite(max) ? max - min : undefined;
            };
            const duration = get("main") || 0;
            const fetch = get("fetch");
            const decode = get("decode");
            const process = get("isoline");
            return {
                url,
                tilesUsed: this.tilesFetched,
                origin: this.timeOrigin,
                marks: this.marks,
                resources: [
                    ...this.resources,
                    ...flatten(this.fetched.map(getResourceTiming)),
                ],
                duration,
                fetch,
                decode,
                process,
                wait: duration - (fetch || 0) - (decode || 0) - (process || 0),
            };
        };
        this.error = (url) => (Object.assign(Object.assign({}, this.finish(url)), { error: true }));
        this.marker = (category) => {
            var _a;
            if (!this.marks[category]) {
                this.marks[category] = [];
            }
            const marks = [now()];
            (_a = this.marks[category]) === null || _a === void 0 ? void 0 : _a.push(marks);
            return () => marks.push(now());
        };
        this.useTile = (url) => {
            if (this.urls.indexOf(url) < 0) {
                this.urls.push(url);
                this.tilesFetched++;
            }
        };
        this.fetchTile = (url) => {
            if (this.fetched.indexOf(url) < 0) {
                this.fetched.push(url);
            }
        };
        this.addAll = (timings) => {
            var _a;
            this.tilesFetched += timings.tilesUsed;
            const offset = timings.origin - this.timeOrigin;
            for (const category in timings.marks) {
                const key = category;
                const ourList = this.marks[key] || (this.marks[key] = []);
                ourList.push(...(((_a = timings.marks[key]) === null || _a === void 0 ? void 0 : _a.map((ns) => ns.map((n) => n + offset))) || []));
            }
            this.resources.push(...timings.resources.map((rt) => applyOffset(rt, offset)));
        };
        this.markFinish = this.marker(name);
    }
}
const startOrEnd = /(Start$|End$|^start|^end)/;
function applyOffset(obj, offset) {
    const result = {};
    for (const key in obj) {
        if (obj[key] !== 0 && startOrEnd.test(key)) {
            result[key] = Number(obj[key]) + offset;
        }
        else {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Caches, decodes, and processes raster tiles in the current thread.
 */
class LocalDemManager {
    constructor(fileUrl, cacheSize, encoding, maxzoom, timeoutMs) {
        this.pmtiles = null;
        this.loaded = Promise.resolve();
        this.decodeImage = defaultDecoder;
        this.fetchAndParseTile = (z, x, y, abortController, timer) => {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this;
            const url = `${z}/${x}/${y}`;
            timer === null || timer === void 0 ? void 0 : timer.useTile(url);
            return this.parsedCache.get(url, (_, childAbortController) => __awaiter(this, void 0, void 0, function* () {
                const response = yield self.fetchTile(z, x, y, childAbortController, timer);
                if (isAborted(childAbortController))
                    throw new Error("canceled");
                const promise = self.decodeImage(response.data, self.encoding, childAbortController);
                const mark = timer === null || timer === void 0 ? void 0 : timer.marker("decode");
                const result = yield promise;
                mark === null || mark === void 0 ? void 0 : mark();
                return result;
            }), abortController);
        };
        this.tileCache = new AsyncCache(cacheSize);
        this.parsedCache = new AsyncCache(cacheSize);
        this.contourCache = new AsyncCache(cacheSize);
        this.timeoutMs = timeoutMs;
        this.fileUrl = fileUrl;
        this.encoding = encoding;
        this.maxzoom = maxzoom;
        this.pmtiles = null;
    }
    initializePMTiles() {
        return __awaiter(this, void 0, void 0, function* () {
            this.pmtiles = openPMtiles(this.fileUrl);
        });
    }
    fetchTile(z, x, y, parentAbortController, timer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pmtiles) {
                throw new Error("pmtiles is not initialized.");
            }
            const url = `${z}/${x}/${y}`;
            timer === null || timer === void 0 ? void 0 : timer.useTile(url); // Use the timer here
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (parentAbortController.signal.aborted) {
                    reject(new Error("Request aborted by parent."));
                    return;
                }
                const childAbortController = new AbortController();
                parentAbortController.signal.addEventListener("abort", () => {
                    childAbortController.abort();
                });
                try {
                    timer === null || timer === void 0 ? void 0 : timer.fetchTile(url);
                    const mark = timer === null || timer === void 0 ? void 0 : timer.marker("fetch");
                    if (this.pmtiles) {
                        const zxyTile = yield getPMtilesTile(this.pmtiles, z, x, y);
                        mark === null || mark === void 0 ? void 0 : mark();
                        if (zxyTile && zxyTile.data) {
                            const blob = new Blob([zxyTile.data]);
                            resolve({
                                data: blob,
                                expires: undefined,
                                cacheControl: undefined,
                            });
                        }
                        else {
                            reject(new Error(`Tile data not found for z:${z} x:${x} y:${y}`));
                        }
                    }
                    else {
                        reject(new Error("pmtiles is not initialized."));
                    }
                }
                catch (error) {
                    reject(new Error(`Failed to fetch DEM tile for z:${z} x:${x} y:${y} from PMTiles: ${error}`));
                }
                finally {
                    childAbortController.abort();
                }
            }));
        });
    }
    fetchDem(z, x, y, options, abortController, timer) {
        return __awaiter(this, void 0, void 0, function* () {
            const zoom = Math.min(z - (options.overzoom || 0), this.maxzoom);
            const subZ = z - zoom;
            const div = 1 << subZ;
            const newX = Math.floor(x / div);
            const newY = Math.floor(y / div);
            const tile = yield this.fetchAndParseTile(zoom, newX, newY, abortController, timer);
            return HeightTile.fromRawDem(tile).split(subZ, x % div, y % div);
        });
    }
    fetchContourTile(z, x, y, options, parentAbortController, timer) {
        const { levels, multiplier = 1, buffer = 1, extent = 4096, contourLayer = "contours", elevationKey = "ele", levelKey = "level", subsampleBelow = 100, } = options;
        // no levels means less than min zoom with levels specified
        if (!levels || levels.length === 0) {
            return Promise.resolve({ arrayBuffer: new ArrayBuffer(0) });
        }
        const key = [z, x, y, encodeIndividualOptions(options)].join("/");
        return this.contourCache.get(key, (_, childAbortController) => __awaiter(this, void 0, void 0, function* () {
            const max = 1 << z;
            const neighborPromises = [];
            for (let iy = y - 1; iy <= y + 1; iy++) {
                for (let ix = x - 1; ix <= x + 1; ix++) {
                    neighborPromises.push(iy < 0 || iy >= max
                        ? undefined
                        : this.fetchDem(z, (ix + max) % max, iy, options, childAbortController, timer));
                }
            }
            const neighbors = yield Promise.all(neighborPromises);
            let virtualTile = HeightTile.combineNeighbors(neighbors);
            if (!virtualTile || isAborted(childAbortController)) {
                return { arrayBuffer: new Uint8Array().buffer };
            }
            const mark = timer === null || timer === void 0 ? void 0 : timer.marker("isoline");
            if (virtualTile.width >= subsampleBelow) {
                virtualTile = virtualTile.materialize(2);
            }
            else {
                while (virtualTile.width < subsampleBelow) {
                    virtualTile = virtualTile.subsamplePixelCenters(2).materialize(2);
                }
            }
            virtualTile = virtualTile
                .averagePixelCentersToGrid()
                .scaleElevation(multiplier)
                .materialize(1);
            const isolines = generateIsolines(levels[0], virtualTile, extent, buffer);
            mark === null || mark === void 0 ? void 0 : mark();
            const result = encodeVectorTile({
                extent,
                layers: {
                    [contourLayer]: {
                        features: Object.entries(isolines).map(([eleString, geom]) => {
                            const ele = Number(eleString);
                            return {
                                type: GeomType.LINESTRING,
                                geometry: geom,
                                properties: {
                                    [elevationKey]: ele,
                                    [levelKey]: Math.max(...levels.map((l, i) => (ele % l === 0 ? i : 0))),
                                },
                            };
                        }),
                    },
                },
            });
            mark === null || mark === void 0 ? void 0 : mark();
            return { arrayBuffer: result.buffer };
        }), parentAbortController);
    }
}

let id = 0;
/**
 * Utility for sending messages to a remote instance of `<T>` running in a web worker
 * from the main thread, or in the main thread running from a web worker.
 */
class Actor {
    constructor(dest, dispatcher, timeoutMs = 20000) {
        this.callbacks = {};
        this.cancels = {};
        this.dest = dest;
        this.timeoutMs = timeoutMs;
        this.dest.onmessage = (_a) => __awaiter(this, [_a], void 0, function* ({ data }) {
            const message = data;
            if (message.type === "cancel") {
                const cancel = this.cancels[message.id];
                delete this.cancels[message.id];
                cancel === null || cancel === void 0 ? void 0 : cancel.abort();
            }
            else if (message.type === "response") {
                const callback = this.callbacks[message.id];
                delete this.callbacks[message.id];
                if (callback) {
                    callback(message.error ? new Error(message.error) : undefined, message.response, message.timings);
                }
            }
            else if (message.type === "request") {
                const timer = new Timer("worker");
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                const handler = dispatcher[message.name];
                const abortController = new AbortController();
                const request = handler.apply(handler, [
                    ...message.args,
                    abortController,
                    timer,
                ]);
                const url = `${message.name}_${message.id}`;
                if (message.id && request) {
                    this.cancels[message.id] = abortController;
                    try {
                        const response = yield request;
                        const transferrables = response === null || response === void 0 ? void 0 : response.transferrables;
                        this.postMessage({
                            id: message.id,
                            type: "response",
                            response,
                            timings: timer.finish(url),
                        }, transferrables);
                    }
                    catch (e) {
                        this.postMessage({
                            id: message.id,
                            type: "response",
                            error: (e === null || e === void 0 ? void 0 : e.toString()) || "error",
                            timings: timer.finish(url),
                        });
                    }
                    delete this.cancels[message.id];
                }
            }
        });
    }
    postMessage(message, transferrables) {
        this.dest.postMessage(message, transferrables || []);
    }
    /** Invokes a method by name with a set of arguments in the remote context. */
    send(name, transferrables, abortController, timer, ...args) {
        const thisId = ++id;
        const value = new Promise((resolve, reject) => {
            this.postMessage({ id: thisId, type: "request", name, args }, transferrables);
            this.callbacks[thisId] = (error, result, timings) => {
                timer === null || timer === void 0 ? void 0 : timer.addAll(timings);
                if (error)
                    reject(error);
                else
                    resolve(result);
            };
        });
        onAbort(abortController, () => {
            delete this.callbacks[thisId];
            this.postMessage({ id: thisId, type: "cancel" });
        });
        return withTimeout(this.timeoutMs, value, abortController);
    }
}

exports.A = Actor;
exports.C = C;
exports.H = HeightTile;
exports.L = LocalDemManager;
exports.T = Timer;
exports._ = __awaiter;
exports.a = decodeOptions;
exports.b = generateIsolines;
exports.c = decodeParsedImage;
exports.d = defaultDecoder;
exports.e = encodeOptions;
exports.f = prepareContourTile;
exports.g = getOptionsForZoom;
exports.p = prepareDemTile;
exports.x = x;

}));

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

define(['./shared'], (function (actor) { 'use strict';

const CONFIG = { workerUrl: "" };

let _actor;
let id = 0;
class MainThreadDispatch {
    constructor() {
        this.decodeImage = (blob, encoding, abortController) => actor.p(actor.d(blob, encoding, abortController), false);
    }
}
function defaultActor() {
    if (!_actor) {
        const worker = new Worker(CONFIG.workerUrl);
        const dispatch = new MainThreadDispatch();
        _actor = new actor.A(worker, dispatch);
    }
    return _actor;
}
/**
 * Caches, decodes, and processes raster tiles in a shared web worker.
 */
class RemoteDemManager {
    constructor(fileUrl, cacheSize, encoding, maxzoom, timeoutMs, actor) {
        this.pmtiles = null;
        this.fetchTile = (z, x, y, abortController, timer) => this.actor.send("fetchTile", [], abortController, timer, this.managerId, z, x, y);
        this.fetchAndParseTile = (z, x, y, abortController, timer) => this.actor.send("fetchAndParseTile", [], abortController, timer, this.managerId, z, x, y);
        this.fetchContourTile = (z, x, y, options, abortController, timer) => this.actor.send("fetchContourTile", [], abortController, timer, this.managerId, z, x, y, options);
        const managerId = (this.managerId = ++id);
        this.pmtiles = null;
        this.fileUrl = fileUrl;
        this.actor = actor || defaultActor();
        this.loaded = this.actor.send("init", [], new AbortController(), undefined, {
            cacheSize,
            fileUrl,
            encoding,
            maxzoom,
            managerId,
            timeoutMs,
        });
    }
    initializePMTiles() {
        return actor._(this, void 0, void 0, function* () {
            const source = new actor.C(this.fileUrl);
            this.pmtiles = new actor.x(source);
        });
    }
}

if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            fileReader.onload = (event) => { var _a; return resolve((_a = event.target) === null || _a === void 0 ? void 0 : _a.result); };
            fileReader.onerror = reject;
            fileReader.readAsArrayBuffer(this);
        });
    };
}
const v3compat = (v4) => (requestParameters, arg2) => {
    if (arg2 instanceof AbortController) {
        return v4(requestParameters, arg2);
    }
    else {
        const abortController = new AbortController();
        v4(requestParameters, abortController)
            .then((result) => arg2(undefined, result.data, result.cacheControl, result.expires), (err) => arg2(err))
            .catch((err) => arg2(err));
        return { cancel: () => abortController.abort() };
    }
};
const used = new Set();
/**
 * A remote source of DEM tiles that can be connected to maplibre.
 */
class DemSource {
    constructor({ url, cacheSize = 100, id = "dem", encoding = "terrarium", maxzoom = 12, worker = true, timeoutMs = 10000, actor: actor$1, }) {
        this.timingCallbacks = [];
        /** Registers a callback to be invoked with a performance report after each tile is requested. */
        this.onTiming = (callback) => {
            this.timingCallbacks.push(callback);
        };
        /**
         * Adds contour and shared DEM protocol handlers to maplibre.
         *
         * @param maplibre maplibre global object
         */
        this.setupMaplibre = (maplibre) => {
            maplibre.addProtocol(this.sharedDemProtocolId, this.sharedDemProtocol);
            maplibre.addProtocol(this.contourProtocolId, this.contourProtocol);
        };
        /**
         * Callback to be used with maplibre addProtocol to re-use cached DEM tiles across sources.
         */
        this.sharedDemProtocolV4 = (request, abortController) => actor._(this, void 0, void 0, function* () {
            const [z, x, y] = this.parseUrl(request.url);
            const timer = new actor.T("main");
            let timing;
            try {
                const data = yield this.manager.fetchTile(z, x, y, abortController, timer);
                timing = timer.finish(request.url);
                const arrayBuffer = yield data.data.arrayBuffer();
                return {
                    data: arrayBuffer,
                    cacheControl: data.cacheControl,
                    expires: data.expires,
                };
            }
            catch (error) {
                timing = timer.error(request.url);
                throw error;
            }
            finally {
                this.timingCallbacks.forEach((cb) => cb(timing));
            }
        });
        /**
         * Callback to be used with maplibre addProtocol to generate contour vector tiles according
         * to options encoded in the tile URL pattern generated by `contourProtocolUrl`.
         */
        this.contourProtocolV4 = (request, abortController) => actor._(this, void 0, void 0, function* () {
            const timer = new actor.T("main");
            let timing;
            try {
                const [z, x, y] = this.parseUrl(request.url);
                const options = actor.a(request.url);
                const data = yield this.manager.fetchContourTile(z, x, y, actor.g(options, z), abortController, timer);
                timing = timer.finish(request.url);
                return { data: data.arrayBuffer };
            }
            catch (error) {
                timing = timer.error(request.url);
                throw error;
            }
            finally {
                this.timingCallbacks.forEach((cb) => cb(timing));
            }
        });
        this.contourProtocol = v3compat(this.contourProtocolV4);
        this.sharedDemProtocol = v3compat(this.sharedDemProtocolV4);
        /**
         * Returns a URL with the correct maplibre protocol prefix and all `option` encoded in request parameters.
         */
        this.contourProtocolUrl = (options) => `${this.contourProtocolUrlBase}?${actor.e(options)}`;
        let protocolPrefix = id;
        let i = 1;
        while (used.has(protocolPrefix)) {
            protocolPrefix = id + i++;
        }
        used.add(protocolPrefix);
        this.sharedDemProtocolId = `${protocolPrefix}-shared`;
        this.contourProtocolId = `${protocolPrefix}-contour`;
        this.sharedDemProtocolUrl = `${this.sharedDemProtocolId}://{z}/{x}/{y}`;
        this.contourProtocolUrlBase = `${this.contourProtocolId}://{z}/{x}/{y}`;
        const ManagerClass = worker ? RemoteDemManager : actor.L;
        this.manager = new ManagerClass(url, cacheSize, encoding, maxzoom, timeoutMs, actor$1);
        this.manager.initializePMTiles();
    }
    getDemTile(z, x, y, abortController) {
        return this.manager.fetchAndParseTile(z, x, y, abortController || new AbortController());
    }
    parseUrl(url) {
        const [, z, x, y] = /\/\/(\d+)\/(\d+)\/(\d+)/.exec(url) || [];
        return [Number(z), Number(x), Number(y)];
    }
}

const exported = {
    generateIsolines: actor.b,
    DemSource,
    HeightTile: actor.H,
    LocalDemManager: actor.L,
    decodeParsedImage: actor.c,
    set workerUrl(url) {
        CONFIG.workerUrl = url;
    },
    get workerUrl() {
        return CONFIG.workerUrl;
    },
};

return exported;

}));

/* eslint-disable no-undef */

var mlcontour$1 = mlcontour;

export { mlcontour$1 as default };
