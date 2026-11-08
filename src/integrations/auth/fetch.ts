export const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.any([
      AbortSignal.timeout(5000),
      ...(init?.signal ? [init.signal] : []),
    ]),
  });
