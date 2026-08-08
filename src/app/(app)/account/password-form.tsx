"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

const MIN_LENGTH = 8;

export default function PasswordForm({ email }: { email: string }) {
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Checked as the person types so the button explains itself before it is pressed.
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirmation.length > 0 && next !== confirmation;
  const unchanged = next.length > 0 && next === current;
  const ready =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirmation && !unchanged;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    setError(null);
    setBusy(true);
    const supabase = createClient();

    try {
      // Supabase lets a signed-in session change the password without proving
      // the old one. Re-checking it here means an unattended, already signed-in
      // browser cannot be used to take the account over.
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (checkError) {
        setError("Your current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) throw updateError;

      setCurrent("");
      setNext("");
      setConfirmation("");
      toast.success("Password changed", "Use the new password the next time you sign in.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The password could not be changed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nsuk-blue-50">
          <KeyRound className="h-5 w-5 text-nsuk-blue" />
        </span>
        <div>
          <h2 className="font-semibold text-nsuk-ink">Change password</h2>
          <p className="mt-0.5 text-sm text-nsuk-muted">
            Choose a password of at least {MIN_LENGTH} characters that you do not use anywhere else.
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="current-password">
          Current password
        </label>
        <input
          id="current-password"
          type={reveal ? "text" : "password"}
          className="field"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
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
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            aria-describedby="new-password-hint"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide passwords" : "Show passwords"}
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-nsuk-faint transition hover:bg-nsuk-cream hover:text-nsuk-ink"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p id="new-password-hint" className="hint">
          {tooShort
            ? `At least ${MIN_LENGTH} characters are required.`
            : unchanged
              ? "The new password is the same as the current one."
              : `${MIN_LENGTH} characters or more.`}
        </p>
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

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!ready || busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Change password
      </button>
    </form>
  );
}
