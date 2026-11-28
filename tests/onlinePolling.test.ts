import { afterEach, describe, expect, it, vi } from 'vitest';
import { startOnlinePolling } from '@/domain/onlinePolling';

afterEach(() => vi.useRealTimers());

describe('online polling lifecycle', () => {
  it('does not send a request for a disposed initial setup', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => {});
    const poll = startOnlinePolling(read, () => 4000);
    poll.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).not.toHaveBeenCalled();
  });

  it('coalesces foreground events and schedules from completion', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const read = vi.fn(async () => gate);
    const poll = startOnlinePolling(read, () => 4000);
    await vi.advanceTimersByTimeAsync(0);
    poll.refresh();
    poll.refresh();
    await vi.advanceTimersByTimeAsync(3000);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    poll.stop();
  });

  it('recovers after an unexpected reader rejection',async()=>{
    vi.useFakeTimers();
    const read=vi.fn(async()=>{}).mockRejectedValueOnce(new Error('transport'));
    const poll=startOnlinePolling(read,()=>1000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
    poll.stop();
  });

  it('aborts on timeout and retries, then aborts on disposal', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const read = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    const poll = startOnlinePolling(read, () => 5000, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(signals).toHaveLength(2);
    poll.stop();
    expect(signals[1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(signals).toHaveLength(2);
  });
});
