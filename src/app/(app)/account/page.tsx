import { requireSession } from "@/lib/session";
import PasswordForm from "./password-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const { profile, isAdmin } = await requireSession();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-nsuk-blue">My account</h1>
        <p className="mt-1 text-sm text-nsuk-muted">
          Your details on the system, and where you change your password.
        </p>
      </div>

      <dl className="card grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="label mb-0">Name</dt>
          <dd className="text-sm text-nsuk-ink">{profile.name || "Not recorded"}</dd>
        </div>
        <div>
          <dt className="label mb-0">Email address</dt>
          <dd className="text-sm break-all text-nsuk-ink">{profile.email}</dd>
        </div>
        <div>
          <dt className="label mb-0">Role</dt>
          <dd className="text-sm text-nsuk-ink">{isAdmin ? "Administrator" : "Staff"}</dd>
        </div>
      </dl>

      <PasswordForm email={profile.email} />
    </div>
  );
}
