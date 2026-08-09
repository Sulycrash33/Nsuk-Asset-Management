import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./login-form";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  // No campus list is fetched: the campus is set when the account is created,
  // so the sign-in screen has no business asking for one.
  const supabase = await createClient();
  const { data: needsBootstrap } = await supabase.rpc("needs_bootstrap");

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

        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <LoginForm needsBootstrap={needsBootstrap === true} />
        </Suspense>
      </div>
    </main>
  );
}
