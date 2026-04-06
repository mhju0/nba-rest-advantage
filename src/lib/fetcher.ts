import type { ApiResponse } from "@/types"

/**
 * Generic SWR fetcher that unwraps our { data, error } API envelope.
 * Throws on API-level errors so SWR treats them as errors.
 */
export async function apiFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = (await res.json()) as ApiResponse<T>
  if (json.error) throw new Error(json.error)
  return json.data
}
