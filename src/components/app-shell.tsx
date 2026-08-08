"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Boxes,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Printer,
  ScanLine,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; icon: typeof Boxes; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assets", label: "Assets", icon: Boxes },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/assets/new", label: "Add asset", icon: Plus },
  { href: "/assets/import", label: "Bulk CSV import", icon: Upload },
  { href: "/labels", label: "Print labels", icon: Printer },
  { href: "/search", label: "Global search", icon: Search, adminOnly: true },
  { href: "/units", label: "Org units", icon: Building2, adminOnly: true },
  { href: "/users", label: "Staff accounts", icon: Users, adminOnly: true },
  { href: "/activity", label: "Activity log", icon: Activity, adminOnly: true },
];

/** Thumb-reachable bottom bar on phones; the Scan button is the raised centre key. */
const TABS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/assets", label: "Assets", icon: Boxes },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/assets/new", label: "Add", icon: Plus },
];

export default function AppShell({
  children,
  name,
  email,
  isAdmin,
  scopeLabel,
  campusName,
}: {
  children: React.ReactNode;
  name: string;
  email: string;
  isAdmin: boolean;
  scopeLabel: string;
  campusName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = NAV.filter((item) => isAdmin || !item.adminOnly);
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 border-r border-nsuk-line bg-white lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-2.5 border-b border-nsuk-line p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nsuk-logo.svg" alt="" className="h-9 w-9" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-nsuk-blue">NSUK Assets</p>
            <p className="text-[11px] text-neutral-500">{isAdmin ? "Administrator" : "Staff"}</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-nsuk-blue text-white"
                  : "text-neutral-700 hover:bg-nsuk-cream"
              }`}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-nsuk-line p-3">
          <p className="truncate text-sm font-semibold text-nsuk-ink">{name}</p>
          <p className="truncate text-xs text-neutral-500">{email}</p>
          <p className="mt-1 truncate text-xs text-nsuk-green">{scopeLabel}</p>
          <button onClick={signOut} className="btn-ghost btn-sm mt-3 w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-nsuk-line bg-white px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nsuk-logo.svg" alt="" className="h-8 w-8" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-nsuk-blue">NSUK Assets</p>
              <p className="max-w-[42vw] truncate text-[11px] text-neutral-500">{scopeLabel}</p>
            </div>
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-nsuk-line text-nsuk-blue"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-10">{children}</main>

        {/* Mobile bottom tabs */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-nsuk-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="grid grid-cols-4">
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              const isScan = tab.href === "/scan";
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                      isScan
                        ? "bg-nsuk-gold text-nsuk-ink shadow-md"
                        : active
                          ? "bg-nsuk-blue text-white"
                          : "text-neutral-500"
                    }`}
                  >
                    <tab.icon className="h-5 w-5" />
                  </span>
                  <span className={active ? "text-nsuk-blue" : "text-neutral-500"}>
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[86vw] flex-col bg-white">
            <div className="flex items-start justify-between border-b border-nsuk-line p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-nsuk-ink">{name}</p>
                <p className="truncate text-xs text-neutral-500">{email}</p>
                <p className="mt-1 text-xs text-nsuk-green">{scopeLabel}</p>
                {campusName && <p className="text-xs text-neutral-500">{campusName} campus</p>}
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-nsuk-line"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                    isActive(item.href)
                      ? "bg-nsuk-blue text-white"
                      : "text-neutral-700 hover:bg-nsuk-cream"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-nsuk-line p-3">
              <button onClick={signOut} className="btn-ghost w-full">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
