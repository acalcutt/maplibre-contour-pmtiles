interface CacheItem<V> {
    lastUsed: number;
    waiting: number;
    abortController?: AbortController;
    item: Promise<V>;
}
/**
 * LRU Cache for CancelablePromises.
 * The underlying request is only canceled when all callers have canceled their usage of it.
 */
export default class AsyncCache<K, V> {
    maxSize: number;
    items: Map<K, CacheItem<V>>;
    constructor(maxSize?: number);
    size: () => number;
    get: (key: K, supplier: (key: K, abortController: AbortController) => Promise<V>, abortController: AbortController) => Promise<V>;
    prune(): void;
    clear: () => void;
}
export {};
