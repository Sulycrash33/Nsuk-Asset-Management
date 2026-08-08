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
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, campus_id: campusId, role: "admin" } },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          setNotice(
            "Account created. Check your inbox to confirm the email address, then sign in.",
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

        // The chosen campus is stamped on the profile so unit lists and exports
        // default to where this person actually works.
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user && campusId) {
          await supabase
            .from("profiles")
            .update({ campus_id: campusId })
            .eq("id", userData.user.id)
            .is("campus_id", null);
        }
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Please try again.");
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
            ? "No accounts exist yet. This one-time screen creates the University-wide administrator."
            : "Use the credentials issued for the asset register."}
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
      </div>

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
