import Link from "next/link";
import { Compass, Home, ScanLine } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-blue-50">
          <Compass className="h-7 w-7 text-nsuk-blue" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-nsuk-blue">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-nsuk-muted">
          That address does not exist — or the asset it pointed to has been removed or moved to a
          unit outside your access.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link href="/dashboard" className="btn-primary">
            <Home className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/scan" className="btn-ghost">
            <ScanLine className="h-4 w-4" /> Scan an asset
          </Link>
        </div>
      </div>
    </div>
  );
}
