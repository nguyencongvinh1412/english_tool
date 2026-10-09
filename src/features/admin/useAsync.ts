/**
 * useAsync
 * Loads data on mount and exposes reload(); enough for admin lists without a query library
 */
import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  reload: () => Promise<void>;
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The caller controls when to reload through deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, isLoading, reload };
}
