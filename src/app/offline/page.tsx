import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "No connection" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-gold-50">
          <WifiOff className="h-7 w-7 text-nsuk-gold-deep" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-nsuk-blue">No connection</h1>
        <p className="mt-2 text-sm leading-relaxed text-nsuk-muted">
          This page has not been opened on this device before, so there is nothing stored to show
          you. Anything you scanned during a verification is safe and will be sent as soon as the
          signal returns.
        </p>
        <Link href="/verify" className="btn-primary mt-6 w-full">
          Back to verification
        </Link>
      </div>
    </main>
  );
}
