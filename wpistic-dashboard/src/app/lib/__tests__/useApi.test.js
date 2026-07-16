import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from '../useApi.js';

describe('useApi', () => {
  it('starts in a loading state with no data or error', () => {
    const fetcher = () => new Promise(() => {}); // never resolves
    const { result } = renderHook(() => useApi(fetcher, []));

    expect(result.current).toMatchObject({ data: null, loading: true, error: null });
  });

  it('resolves to the fetched data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.error).toBeNull();
  });

  it('captures a thrown error without touching data', async () => {
    const err = new Error('boom');
    const fetcher = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(err);
  });

  it('reload() re-invokes the fetcher and replaces the previous data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('first');

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.data).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('unmounting before the fetcher resolves does not throw', async () => {
    let resolveFetch;
    const fetcher = () => new Promise((resolve) => { resolveFetch = resolve; });

    const { unmount } = renderHook(() => useApi(fetcher, []));
    unmount();

    expect(() => resolveFetch({ ok: true })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
