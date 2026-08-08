"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Campus, Role } from "@/lib/types";

export default function LoginForm({
  campuses,
  needsBootstrap,
}: {
  campuses: Campus[];
  needsBootstrap: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "bootstrap">(
    needsBootstrap ? "bootstrap" : "login",
  );
  const [role, setRole] = useState<Role>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  // Default to the main campus rather than whichever sorts first alphabetically.
  const [campusId, setCampusId] = useState(
    (campuses.find((c) => c.name.startsWith("Keffi")) ?? campuses[0])?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const supabase = createClient();

    try {
      if (mode === "bootstrap") {
        // The first account is the University-wide administrator — no campus,
        // because every campus is theirs.
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, role: "admin" } },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          setNotice(
            "The account has been created. Confirm the email address from your inbox, then sign in.",
          );
          setMode("login");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        // Staff belong to one campus, so the choice is stamped on their profile
        // the first time they sign in. Administrators cover every campus and
        // are deliberately left without one.
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: existing } = await supabase
            .from("profiles")
            .select("role,campus_id")
            .eq("id", userData.user.id)
            .single();

          if (existing?.role === "staff" && !existing.campus_id && campusId) {
            await supabase
              .from("profiles")
              .update({ campus_id: campusId })
              .eq("id", userData.user.id);
          }
        }
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in was unsuccessful. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-fade-up space-y-4">
      <div>
        <h1 className="text-xl font-bold text-nsuk-blue">
          {mode === "bootstrap" ? "Create the first administrator" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">
          {mode === "bootstrap"
            ? "No account exists on the system yet. This screen appears once, and creates the University-wide administrator."
            : "Enter the credentials issued to you by the system administrator."}
        </p>
      </div>

      {mode === "login" && (
        <div
          role="tablist"
          aria-label="Account type"
          className="relative grid grid-cols-2 gap-1 rounded-xl bg-nsuk-cream p-1"
        >
          {(
            [
              ["staff", "Staff", UserRound],
              ["admin", "Administrator", ShieldCheck],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={role === value}
              onClick={() => setRole(value)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                role === value
                  ? "bg-nsuk-blue text-white shadow-[var(--shadow-e2)]"
                  : "text-nsuk-blue hover:bg-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "bootstrap" && (
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="e.g. Ibrahim Musa"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="name@nsuk.edu.ng"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            className="field pr-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-nsuk-faint transition hover:bg-nsuk-cream hover:text-nsuk-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Only staff belong to a single campus. Administrators cover them all,
          so asking them to pick one would be misleading. */}
      {mode === "login" && role === "staff" ? (
        <div>
          <label className="label" htmlFor="campus">
            Campus
          </label>
          <select
            id="campus"
            className="field"
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="hint">
            Select the campus where you are based. Access to assets is determined by your unit
            assignment.
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-nsuk-gold/30 bg-nsuk-gold-50 p-3 text-sm text-nsuk-gold-deep">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Administrators have access to all four campuses. No campus selection is required.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-xl border border-nsuk-green/25 bg-nsuk-green-50 p-3 text-sm text-nsuk-green-dark">
          {notice}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "bootstrap" ? "Create administrator account" : "Sign in"}
      </button>
    </form>
  );
}
