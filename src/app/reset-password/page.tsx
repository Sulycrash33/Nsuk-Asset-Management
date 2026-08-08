import Link from "next/link";
import { Suspense } from "react";
import ResetForm from "./reset-form";

export const metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Link href="/" className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nsuk-crest.png" alt="" className="h-11 w-11" />
          <div className="leading-tight">
            <p className="font-bold text-nsuk-blue">NSUK Asset Management System</p>
            <p className="text-xs text-nsuk-faint">Nasarawa State University, Keffi</p>
          </div>
        </Link>

        <Suspense fallback={<div className="card h-72 animate-pulse" />}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
