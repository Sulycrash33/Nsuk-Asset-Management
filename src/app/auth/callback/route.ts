import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { expiredCallbackPath, safeAppPath } from "@/lib/auth-callback";

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
  const destination = safeAppPath(next);

  if (!code) {
    // Admin invitations use an implicit fragment, invisible to this server.
    // Older emails still target this route; browsers preserve that fragment
    // across this redirect so the dedicated client can consume it securely.
    const completion = new URL("/auth/complete", origin);
    completion.searchParams.set("next", destination);
    return NextResponse.redirect(completion);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired, already used, or tampered with. The reset page explains this
    // properly rather than dropping someone on a bare sign-in screen.
    return NextResponse.redirect(`${origin}${expiredCallbackPath(destination)}`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}

