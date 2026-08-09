import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Confirms the caller is signed in as an administrator. */
async function requireAdminCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Administrators only." }, { status: 403 }) };
  }
  return { supabase };
}

function serviceClient() {
  if (!SERVICE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create a Staff (or Admin) account and assign it to units. */
export async function POST(request: Request) {
  const guard = await requireAdminCaller();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  let body: {
    name?: string;
    email?: string;
    password?: string;
    role?: "admin" | "staff";
    campus_id?: string | null;
    unit_ids?: string[];
    invite?: boolean;
    origin?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = (body.name ?? "").trim();
  const role = body.role === "admin" ? "admin" : "staff";
  const unitIds = body.unit_ids ?? [];

  const invite = body.invite === true;

  if (!email || !name) {
    return NextResponse.json({ error: "Name and email are both required." }, { status: 400 });
  }
  if (!invite) {
    if (!password) {
      return NextResponse.json({ error: "A password is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
  }

  const admin = serviceClient();
  let userId: string;
  let needsEmailConfirmation = false;

  if (invite) {
    // Inviting sends a link and never sets a password, so nobody but the
    // recipient ever knows one. It needs the service key: there is no way to
    // send an invitation with the public key, by design.
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Invitations need SUPABASE_SERVICE_ROLE_KEY to be configured on the server. Set a password for this account instead.",
        },
        { status: 400 },
      );
    }

    const origin = typeof body.origin === "string" ? body.origin : new URL(request.url).origin;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password?welcome=1")}`,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Could not send the invitation." },
        { status: 400 },
      );
    }
    userId = data.user.id;
  } else if (admin) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, campus_id: body.campus_id ?? null },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create the account." },
        { status: 400 },
      );
    }
    userId = data.user.id;
  } else {
    // No service key configured: fall back to an ordinary sign-up on a client
    // that never persists a session, so the administrator stays signed in.
    const anon = createSupabaseClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { name, role, campus_id: body.campus_id ?? null } },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create the account." },
        { status: 400 },
      );
    }
    userId = data.user.id;
    needsEmailConfirmation = !data.session;
  }

  // The signup trigger creates the profile; correct role/campus here because a
  // trigger cannot trust client-supplied metadata for privilege decisions.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, name, email, role, campus_id: body.campus_id ?? null });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (unitIds.length) {
    const { error: unitsError } = await supabase
      .from("user_units")
      .insert(unitIds.map((org_unit_id) => ({ user_id: userId, org_unit_id })));
    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ id: userId, needsEmailConfirmation, invited: invite });
}

/**
 * Set a new password on someone else's account.
 *
 * Needed because this University sends account details by hand rather than by
 * email, so "Forgotten password" cannot reach anyone. Without this an
 * administrator has no way to help a member of staff who is locked out, and
 * the only remedy is editing the database.
 */
export async function PATCH(request: Request) {
  const guard = await requireAdminCaller();
  if ("error" in guard) return guard.error;

  let body: { id?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const password = body.password ?? "";

  if (!id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Setting someone else's password needs SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

/** Remove a staff account entirely. Requires the service role key. */
export async function DELETE(request: Request) {
  const guard = await requireAdminCaller();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });

  // The screen hides the option, but the endpoint is reachable on its own, so
  // the rule is enforced here too rather than trusted to the browser.
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (caller?.id === id) {
    return NextResponse.json(
      { error: "You cannot delete your own account. Ask another administrator to do it." },
      { status: 400 },
    );
  }

  // Deleting the auth user cascades to the profile, which would slip past the
  // database trigger that protects the last administrator, so check first.
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).single();
  if (target?.role === "admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "This is the only administrator on the system. Appoint another administrator first, or the University would be locked out of its own register.",
        },
        { status: 400 },
      );
    }
  }

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Deleting accounts needs SUPABASE_SERVICE_ROLE_KEY to be set. You can remove all unit assignments instead, which blocks the account from seeing any assets.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
