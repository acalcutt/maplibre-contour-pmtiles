import type { Timing, TimingCategory } from "./types";
export declare const perf: Performance | undefined;
export declare const timeOrigin: number;
export declare function getResourceTiming(url: string): PerformanceResourceTiming[];
export declare function now(): number;
/** Utility for tracking how long tiles take to generate, and where the time is going. */
export declare class Timer {
    marks: {
        [key in TimingCategory]?: number[][];
    };
    urls: string[];
    fetched: string[];
    resources: PerformanceResourceTiming[];
    markFinish: () => void;
    tilesFetched: number;
    timeOrigin: number;
    constructor(name: TimingCategory);
    finish: (url: string) => Timing;
    error: (url: string) => Timing;
    marker: (category: TimingCategory) => (() => void);
    useTile: (url: string) => void;
    fetchTile: (url: string) => void;
    addAll: (timings: Timing) => void;
}
