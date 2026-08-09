"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  Building2,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Printer,
  ScanLine,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ToastProvider from "@/components/ui/toast";
import ConfirmProvider from "@/components/ui/confirm";
import CommandPalette from "@/components/command-palette";

type NavItem = { href: string; label: string; icon: typeof Boxes; adminOnly?: boolean };

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/assets", label: "Assets", icon: Boxes },
      { href: "/scan", label: "Scan", icon: ScanLine },
    ],
  },
  {
    heading: "Record & tag",
    items: [
      { href: "/assets/new", label: "Add asset", icon: Plus },
      { href: "/assets/import", label: "Bulk CSV import", icon: Upload },
      { href: "/labels", label: "Print labels", icon: Printer },
    ],
  },
  {
    heading: "Administration",
    items: [
      { href: "/search", label: "Global search", icon: Search, adminOnly: true },
      { href: "/units", label: "Org units", icon: Building2, adminOnly: true },
      { href: "/users", label: "Staff accounts", icon: Users, adminOnly: true },
      { href: "/activity", label: "Activity log", icon: Activity, adminOnly: true },
    ],
  },
];

/** Thumb-reachable bottom bar on phones; Scan is the raised centre key. */
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
  const [signingOut, setSigningOut] = useState(false);

  // Close the drawer whenever navigation happens.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    if (href === "/assets") return pathname === "/assets" || /^\/assets\/[^/]+$/.test(pathname);
    return pathname.startsWith(href);
  };

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((group) => group.items.length > 0);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const identity = (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nsuk-blue text-sm font-bold text-white">
        {initials || "?"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-nsuk-ink">{name}</p>
        <p className="truncate text-xs text-nsuk-faint">{email}</p>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-dvh lg:flex">
          {/* ---- Desktop sidebar ---- */}
          <aside className="no-print sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-nsuk-line bg-white lg:flex">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 border-b border-nsuk-line px-4 py-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nsuk-crest.png" alt="" className="h-10 w-10" />
              <div className="leading-tight">
                <p className="font-bold text-nsuk-blue">NSUK Asset Management</p>
                <p className="flex items-center gap-1 text-[11px] text-nsuk-muted">
                  {isAdmin ? (
                    <ShieldCheck className="h-3 w-3 text-nsuk-gold-dark" />
                  ) : (
                    <UserRound className="h-3 w-3" />
                  )}
                  {isAdmin ? "Administrator" : "Staff"}
                </p>
              </div>
            </Link>

            <nav className="scroll-slim flex-1 space-y-5 overflow-y-auto p-3">
              {groups.map((group) => (
                <div key={group.heading}>
                  <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-nsuk-faint uppercase">
                    {group.heading}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                            active
                              ? "bg-nsuk-blue text-white shadow-[var(--shadow-e2)]"
                              : "text-nsuk-ink/80 hover:bg-nsuk-blue-50 hover:text-nsuk-blue"
                          }`}
                        >
                          {active && (
                            <span className="absolute top-1/2 -left-3 h-6 w-1 -translate-y-1/2 rounded-r-full bg-nsuk-gold" />
                          )}
                          <item.icon className="h-4.5 w-4.5 shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="space-y-3 border-t border-nsuk-line p-3">
              {identity}
              <div className="rounded-xl bg-nsuk-cream px-3 py-2">
                <p className="text-[11px] font-semibold tracking-wide text-nsuk-faint uppercase">
                  Scope
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-nsuk-green">{scopeLabel}</p>
                {campusName && <p className="text-xs text-nsuk-faint">{campusName} campus</p>}
              </div>
              <Link href="/account" className="btn-ghost btn-sm w-full">
                <KeyRound className="h-4 w-4" /> My account
              </Link>
              <button onClick={signOut} disabled={signingOut} className="btn-ghost btn-sm w-full">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* ---- Top bar ---- */}
            <header className="no-print sticky top-0 z-30 border-b border-nsuk-line bg-nsuk-cream/85 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
                <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/nsuk-crest.png" alt="" className="h-9 w-9" />
                  <div className="leading-tight">
                    <p className="text-sm font-bold text-nsuk-blue">NSUK Asset Management</p>
                    <p className="max-w-[40vw] truncate text-[11px] text-nsuk-faint">
                      {scopeLabel}
                    </p>
                  </div>
                </Link>

                <div className="hidden lg:block">
                  <CommandPalette isAdmin={isAdmin} />
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/scan"
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-nsuk-gold text-nsuk-ink shadow-[var(--shadow-e2)] transition active:scale-95 lg:hidden"
                    aria-label="Scan an asset"
                  >
                    <ScanLine className="h-5 w-5" />
                  </Link>
                  <button
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-nsuk-line bg-white text-nsuk-blue shadow-[var(--shadow-e1)] transition active:scale-95 lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </button>

                  <div className="hidden items-center gap-3 lg:flex">
                    <span className="rounded-full border border-nsuk-line bg-white px-3 py-1.5 text-xs font-semibold text-nsuk-green">
                      {scopeLabel}
                    </span>
                  </div>
                </div>
              </div>
            </header>

            <main
              key={pathname}
              className="animate-fade-up flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-12"
            >
              {children}
            </main>

            {/* ---- Mobile bottom tabs ---- */}
            <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-nsuk-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-key)] backdrop-blur-md lg:hidden">
              <div className="grid grid-cols-4">
                {TABS.map((tab) => {
                  const active = isActive(tab.href);
                  const isScan = tab.href === "/scan";
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition active:scale-95"
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                          isScan
                            ? // Raised centre key. The margins cancel out — it sits
                              // 16px higher and is 8px taller, so mb-2 puts the
                              // label back in line with the others.
                              "-mt-4 mb-2 h-12 w-12 bg-nsuk-gold text-nsuk-ink shadow-[var(--shadow-e3)]"
                            : active
                              ? "bg-nsuk-blue text-white"
                              : "text-nsuk-faint"
                        }`}
                      >
                        <tab.icon className={isScan ? "h-6 w-6" : "h-5 w-5"} />
                      </span>
                      <span className={active ? "text-nsuk-blue" : "text-nsuk-faint"}>
                        {tab.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* ---- Mobile drawer ---- */}
          {menuOpen && (
            <div className="no-print fixed inset-0 z-50 lg:hidden">
              <button
                aria-label="Close menu"
                className="animate-fade-in absolute inset-0 cursor-default bg-nsuk-ink/45 backdrop-blur-[2px]"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="animate-sheet-up absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col bg-white shadow-[var(--shadow-e3)]"
              >
                <div className="flex items-start justify-between gap-3 border-b border-nsuk-line p-4">
                  {identity}
                  <button
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-nsuk-line text-nsuk-muted"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="border-b border-nsuk-line bg-nsuk-cream px-4 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-nsuk-faint uppercase">
                    Scope
                  </p>
                  <p className="text-xs text-nsuk-green">{scopeLabel}</p>
                  {campusName && <p className="text-xs text-nsuk-faint">{campusName} campus</p>}
                </div>

                <nav className="scroll-slim flex-1 space-y-4 overflow-y-auto p-3">
                  {groups.map((group) => (
                    <div key={group.heading}>
                      <p className="px-3 pb-1 text-[11px] font-bold tracking-wide text-nsuk-faint uppercase">
                        {group.heading}
                      </p>
                      {group.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                              active
                                ? "bg-nsuk-blue text-white"
                                : "text-nsuk-ink/80 hover:bg-nsuk-blue-50"
                            }`}
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            <ChevronRight className="h-4 w-4 opacity-40" />
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </nav>

                <div className="space-y-2 border-t border-nsuk-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Link href="/account" className="btn-ghost w-full">
                    <KeyRound className="h-4 w-4" /> My account
                  </Link>
                  <button onClick={signOut} disabled={signingOut} className="btn-ghost w-full">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
