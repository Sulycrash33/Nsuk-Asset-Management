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

/** Sign a page's distinct keys in one Storage request, retaining per-object denials. */
export async function signedAssetPhotos(client: SupabaseClient, rows: { id: string; photo_url: string | null }[], projectUrl: string) {
  const keys = new Map(rows.map(row => [row.id, photoObjectKey(row.photo_url, projectUrl)]));
  const paths = [...new Set([...keys.values()].filter((key): key is string => key !== null))];
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await client.storage.from("asset-photos").createSignedUrls(paths, 900);
  if (error) return new Map<string, string>();
  const sources = new Map((data ?? []).filter(row => row.path && row.signedUrl && !row.error).map(row => [row.path!, row.signedUrl!]));
  return new Map([...keys].filter(([, key]) => key && sources.has(key)).map(([id, key]) => [id, sources.get(key!)!]));
}

/**
 * Sign each row's small list thumbnail ('<photo>.thumb.jpg'). A photo uploaded
 * before thumbnails existed has none, so those rows fall back to the photo.
 */
export async function signedAssetThumbnails(client: SupabaseClient, rows: { id: string; photo_url: string | null }[], projectUrl: string) {
  const keys = new Map(rows.map(row => [row.id, photoObjectKey(row.photo_url, projectUrl)]));
  const thumbs = [...new Set([...keys.values()].filter((key): key is string => key !== null).map(key => `${key}.thumb.jpg`))];
  if (!thumbs.length) return new Map<string, string>();
  const { data, error } = await client.storage.from("asset-photos").createSignedUrls(thumbs, 900);
  const sources = new Map(error ? [] : (data ?? []).filter(row => row.path && row.signedUrl && !row.error).map(row => [row.path!, row.signedUrl!]));
  const result = new Map([...keys].filter(([, key]) => key && sources.has(`${key}.thumb.jpg`)).map(([id, key]) => [id, sources.get(`${key}.thumb.jpg`)!]));
  const missing = rows.filter(row => keys.get(row.id) && !result.has(row.id));
  if (missing.length) for (const [id, source] of await signedAssetPhotos(client, missing, projectUrl)) result.set(id, source);
  return result;
}
