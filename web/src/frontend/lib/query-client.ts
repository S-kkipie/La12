import { environmentManager, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    // No global `throwOnError` — Eden surfaces failures as a plain
    // `{ status, value }` object, and React renders a thrown non-Error as the
    // useless string "[object Object]". Reads degrade to their fallbacks
    // (`data ?? []`, `rate ?? 1`) per the API contract; mutations handle their
    // own errors via `friendlyError` at the callsite.
    defaultOptions: { queries: { staleTime: 5000 } },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
