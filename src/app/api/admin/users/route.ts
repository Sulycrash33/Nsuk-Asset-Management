import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseAccountInput, provisionAccount, isUserId, type AccountInput } from "@/lib/account-provisioning";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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
  let body: AccountInput;
  try { body = parseAccountInput(await request.json()); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: 400 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "Account creation needs SUPABASE_SERVICE_ROLE_KEY configured on the server." }, { status: 503 });

  // Refuse known duplicates and validate references before creating an Auth user.
  const [{ data: existing, error: profileLookup }, { data: units, error: unitLookup }] = await Promise.all([
    supabase.from("profiles").select("id").eq("email", body.email).maybeSingle(),
    body.unit_ids.length ? supabase.from("org_units").select("id").in("id", body.unit_ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileLookup || unitLookup) return NextResponse.json({ error: "Account details could not be checked. Try again." }, { status: 503 });
  if (existing) return NextResponse.json({ error: "That account already exists. Edit it in Staff accounts." }, { status: 409 });
  if ((units ?? []).length !== body.unit_ids.length) return NextResponse.json({ error: "An assigned unit no longer exists." }, { status: 400 });
  if (body.campus_id) {
    const { data, error } = await supabase.from("campuses").select("id").eq("id", body.campus_id).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Choose an existing campus." }, { status: 400 });
  }
  try {
    const outcome = await provisionAccount(body.invite, {
      create: async () => {
        const result = body.invite
          ? await admin.auth.admin.inviteUserByEmail(body.email, {
              data: { name: body.name },
              redirectTo: `${new URL(request.url).origin}/auth/callback?next=${encodeURIComponent("/reset-password?welcome=1")}`,
            })
          : await admin.auth.admin.createUser({ email: body.email, password: body.password,
              email_confirm: true, user_metadata: { name: body.name } });
        if (result.error || !result.data.user) throw new Error(result.error?.message ?? "Could not create the account.");
        return result.data.user.id;
      },
      provision: async (id) => {
        const { error } = await supabase.rpc("provision_account", { p_user_id: id, p_name: body.name,
          p_email: body.email, p_role: body.role, p_campus_id: body.campus_id, p_unit_ids: body.unit_ids });
        if (error) throw new Error(error.message);
      },
      remove: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw new Error(error.message);
      },
    });
    if (!outcome.ok) return NextResponse.json(outcome, { status: outcome.incompleteUserId ? 409 : 400 });
    return NextResponse.json({ id: outcome.id, needsEmailConfirmation: false, invited: body.invite });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account creation failed." }, { status: 400 });
  }
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

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = body.id;
  const password = body.password;

  if (!isUserId(id)) return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  if (typeof password !== "string" || password.length < 8) {
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
  if (!isUserId(id)) return NextResponse.json({ error: "Invalid user id." }, { status: 400 });

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
