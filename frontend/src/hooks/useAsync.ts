import { useCallback, useEffect, useState } from "react";

/**
 * The one loading pattern every screen uses: call a service, show what came
 * back, surface the failure, and allow a retry.
 */

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, data: undefined, error: undefined });

  const run = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: undefined }));
    try {
      const data = await loader();
      setState({ data, loading: false, error: undefined });
    } catch (cause) {
      setState({
        data: undefined,
        loading: false,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { ...state, refetch: run };
}
