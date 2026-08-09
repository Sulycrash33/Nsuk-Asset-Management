"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

export default function ResetForm() {
  const router = useRouter();
  // An invited person has never had a password, so telling them to reset one
  // would be confusing. Same screen, different words.
  const welcome = useSearchParams().get("welcome") === "1";

  const [ready, setReady] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Supabase turns the token in the emailed link into a short-lived recovery
  // session before this page renders. If there is no session, the link was
  // never valid, has already been used, or has expired.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setReady(data.session ? "valid" : "invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit = password.length >= MIN_LENGTH && password === confirmation;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      // Signed in already by virtue of the recovery session, so go straight in.
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The password could not be set. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (ready === "checking") {
    return <div className="card h-72 animate-pulse" />;
  }

  if (ready === "invalid") {
    return (
      <div className="card space-y-4">
        <h1 className="text-xl font-bold text-nsuk-blue">This link is no longer valid</h1>
        <p className="text-sm leading-relaxed text-nsuk-muted">
          {welcome
            ? "Invitation links expire and can be used only once. Ask the system administrator to send you another."
            : "Password links expire after one hour and can be used only once. Request a new one from the sign-in screen."}
        </p>
        <Link href="/login" className="btn-primary w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card space-y-3 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-green-50">
          <CheckCircle2 className="h-7 w-7 text-nsuk-green" />
        </span>
        <h1 className="text-xl font-bold text-nsuk-blue">Password set</h1>
        <p className="text-sm text-nsuk-muted">Taking you to the system.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-fade-up space-y-4">
      <div>
        <h1 className="text-xl font-bold text-nsuk-blue">
          {welcome ? "Welcome to the NSUK Asset Management System" : "Set a new password"}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">
          {welcome
            ? `Choose a password to finish setting up your account. Use at least ${MIN_LENGTH} characters, and one you do not use anywhere else.`
            : `Choose a password of at least ${MIN_LENGTH} characters that you do not use anywhere else.`}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="new-password">
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={reveal ? "text" : "password"}
            className="field pr-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-nsuk-faint transition hover:bg-nsuk-cream hover:text-nsuk-ink"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {tooShort && <p className="hint text-nsuk-danger">At least {MIN_LENGTH} characters.</p>}
      </div>

      <div>
        <label className="label" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type={reveal ? "text" : "password"}
          className="field"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          autoComplete="new-password"
        />
        {mismatch && <p className="hint text-nsuk-danger">The two passwords do not match.</p>}
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

      <button type="submit" className="btn-primary w-full" disabled={!canSubmit || busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Set password
      </button>
    </form>
  );
}
