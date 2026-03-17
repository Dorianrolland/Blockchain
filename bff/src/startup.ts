import type { Logger } from "pino";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function formatStartupError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

export async function startIndexerInBackground(
  indexer: { start: () => Promise<void> },
  options: {
    logger: Logger;
    signal?: AbortSignal;
    initialDelayMs?: number;
    maxDelayMs?: number;
  },
): Promise<void> {
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  let attempt = 0;

  while (!options.signal?.aborted) {
    try {
      await indexer.start();
      return;
    } catch (error) {
      attempt += 1;
      const delayMs = Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(attempt - 1, 5));

      options.logger.warn(
        {
          attempt,
          delayMs,
          error: formatStartupError(error),
        },
        "Indexer startup failed. Retrying in background.",
      );

      await sleep(delayMs, options.signal);
    }
  }
}
