export const BATCH_CONCURRENCY = {
  scan: 6,
  analyze: 3,
  rename: 4,
  cleanup: 4
} as const;

/**
 * Process items with a fixed concurrency pool (parallel batches).
 */
export async function processConcurrently<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  options?: {
    shouldCancel?: () => boolean | Promise<boolean>;
    onItemComplete?: (index: number, total: number) => void | Promise<void>;
  }
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      if (options?.shouldCancel) {
        const cancelled = await options.shouldCancel();
        if (cancelled) break;
      }

      const index = nextIndex++;
      if (index >= items.length) break;

      results[index] = await processor(items[index], index);
      completed++;

      if (options?.onItemComplete) {
        await options.onItemComplete(completed, items.length);
      }
    }
  };

  const poolSize = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return results;
}

/**
 * Split a large list into chunks for staged batch jobs.
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
