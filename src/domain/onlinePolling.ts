/**
 * One request at a time, including foreground events. The caller owns
 * error handling and computes the next delay after each attempt.
 * A deferred initial request avoids duplicate reads during StrictMode setup.
 */
export function startOnlinePolling(
  read: (signal: AbortSignal) => Promise<void>,
  delay: () => number,
  timeoutMs = 8000,
) {
  let stopped = false;
  let pending: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, ms);
  };

  function refresh() {
    if (stopped || pending) return;
    clearTimeout(timer);
    const controller = new AbortController();
    pending = controller;
    deadline = setTimeout(() => controller.abort(), timeoutMs);
    void (async () => {
      try {
        await read(controller.signal);
      } finally {
        clearTimeout(deadline);
        pending = null;
        if (!stopped) schedule(delay());
      }
    })();
  }

  schedule(0);
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      pending?.abort();
    },
  };
}
