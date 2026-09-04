export class ApiError extends Error {
  constructor(readonly status: number) { super(`API ${status}`); }
}

export async function deepRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/deep/v3/${path}`, {
    method, credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", ...(method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.status === 204 ? null as T : await response.json() as T;
}
