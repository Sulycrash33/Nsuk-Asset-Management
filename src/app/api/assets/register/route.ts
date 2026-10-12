import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { registerQuery } from "@/lib/asset-query";
import { registerScope } from "@/lib/register-scope";
import { ASSET_WITH_REFS_AND_CAMPUS } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url), offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid export offset." }, { status: 400 });
  const session = await requireSession(), supabase = await createClient();
  const filters = registerScope(Object.fromEntries(url.searchParams), session);
  const { data, count, error } = await registerQuery(supabase, ASSET_WITH_REFS_AND_CAMPUS, filters).range(offset, offset + 499);
  if (error || count === null) return NextResponse.json({ error: "Could not load the full register." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ assets: data ?? [], total: count }, { headers: { "Cache-Control": "private, no-store" } });
}
