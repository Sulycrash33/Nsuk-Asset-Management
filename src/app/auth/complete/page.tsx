import { Suspense } from "react";
import CompleteEmail from "./complete-email";

export const metadata = { title: "Complete email sign-in", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function CompleteEmailPage() {
  return <main className="mx-auto max-w-md px-4 py-16"><Suspense fallback={<p>Checking your email link…</p>}><CompleteEmail /></Suspense></main>;
}

