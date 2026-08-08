import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where emailed links land. Supabase sends a one-time code rather than a
 * session, so it is exchanged here, on the server, which sets the session
 * cookies before the destination page renders.
 *
 * Used by the password recovery email. `next` decides where the person ends up
 * and is restricted to paths on this site, so the link cannot be rewritten to
 * bounce someone to another domain carrying their session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link-invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired, already used, or tampered with. The reset page explains this
    // properly rather than dropping someone on a bare sign-in screen.
    return NextResponse.redirect(`${origin}${destination}?link=expired`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
