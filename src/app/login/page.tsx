import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./login-form";
import type { Campus } from "@/lib/types";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  const supabase = await createClient();
  const [{ data: campuses }, { data: needsBootstrap }] = await Promise.all([
    supabase.from("campuses").select("id,name").order("name"),
    supabase.rpc("needs_bootstrap"),
  ]);

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
          <LoginForm
            campuses={(campuses ?? []) as Campus[]}
            needsBootstrap={needsBootstrap === true}
          />
        </Suspense>
      </div>
    </main>
  );
}
