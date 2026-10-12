import type { SupabaseClient } from "@supabase/supabase-js";
/** Accept object keys and legacy URLs only from this project's public bucket. */
export function photoObjectKey(reference: string | null | undefined, projectUrl: string): string | null {
  if (!reference) return null;
  let key = reference;
  if (/^https?:/i.test(reference)) {
    try {
      const url = new URL(reference), project = new URL(projectUrl);
      const prefix = "/storage/v1/object/public/asset-photos/";
      if (url.origin !== project.origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
      key = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch { return null; }
  }
  return key && !key.startsWith("/") && !key.includes("\\") && !key.includes(":") && !/[?#\x00-\x1f]/.test(key) && key.split("/").every(p => p && p !== "." && p !== "..") ? key : null;
}
export async function signedAssetPhoto(client: SupabaseClient, reference: string | null | undefined, projectUrl: string): Promise<string | null> {
  const key = photoObjectKey(reference, projectUrl);
  if (!key) return null;
  const { data, error } = await client.storage.from("asset-photos").createSignedUrl(key, 900);
  return error ? null : data?.signedUrl ?? null;
}
