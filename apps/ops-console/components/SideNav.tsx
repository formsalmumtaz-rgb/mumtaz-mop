"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setActiveDivisionAction } from "@/app/actions/division";
import type { ServiceLine } from "@/lib/domain/reference";

// Active-division picker. Auto-submits on change so every server flow that calls
// getServiceLineId() resolves to the chosen division (Art. XVIII — service-driven).
function DivisionSwitcher({ divisions, active }: { divisions: ServiceLine[]; active: string | null }) {
  if (divisions.length < 2) return null;
  const current = divisions.find((d) => d.code === active)?.code ?? divisions.find((d) => d.code === "pest_control")?.code ?? divisions[0].code;
  return (
    <form action={setActiveDivisionAction} className="px-5 pb-3">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gold">Division</label>
      <select name="division" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none">
        {divisions.map((d) => <option key={d.id} value={d.code} className="text-neutral-900">{d.name}</option>)}
      </select>
    </form>
  );
}

// Grouped, responsive navigation (Sales / Operations / Finance / Admin). Fixed
// sidebar on desktop; slide-in drawer on mobile. The flat 26-item bar did not
// scale — this groups by function so the daily tool reads like an instrument.
type Item = { href: string; label: string };
type Group = { label: string | null; items: Item[] };

const GROUPS: Group[] = [
  { label: null, items: [{ href: "/dashboard", label: "Dashboard" }] },
  { label: "Sales", items: [
    { href: "/customers", label: "Customers" },
    { href: "/surveys", label: "Surveys" },
    { href: "/estimates", label: "Estimates" },
    { href: "/pipeline", label: "Pipeline" },
  ] },
  { label: "Operations", items: [
    { href: "/schedule", label: "Schedule" },
    { href: "/jobs", label: "Jobs" },
    { href: "/jobs/new", label: "New job" },
    { href: "/service-reports", label: "Service reports" },
    { href: "/manpower", label: "Manpower" },
    { href: "/technicians", label: "Technicians" },
    { href: "/teams", label: "Teams" },
    { href: "/vehicles", label: "Vehicles" },
    { href: "/chemicals", label: "Chemicals" },
    { href: "/purchases", label: "Purchases" },
    { href: "/recipes", label: "Treatment recipes" },
  ] },
  { label: "Finance", items: [
    { href: "/invoices", label: "Invoices" },
    { href: "/billing", label: "Billing" },
    { href: "/receipts", label: "Receipts" },
    { href: "/credit-notes", label: "Credit notes" },
    { href: "/ar", label: "Receivables" },
    { href: "/expenses", label: "Expenses" },
    { href: "/cash-flow", label: "Cash flow" },
    { href: "/reports", label: "Reports" },
    { href: "/profitability", label: "Profitability" },
    { href: "/management", label: "Management" },
  ] },
  { label: "Admin", items: [
    { href: "/categories", label: "Service categories" },
    { href: "/pricing", label: "Pricing models" },
    { href: "/cost-config", label: "Cost setup" },
    { href: "/settings/master-data", label: "Master data" },
    { href: "/settings", label: "Settings" },
    { href: "/settings/users", label: "Users" },
  ] },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/settings") return pathname === "/settings"; // exact — avoid matching /settings/*
  return pathname === href || pathname.startsWith(href + "/");
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((g, gi) => (
        <div key={g.label ?? `g${gi}`}>
          {g.label && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gold">{g.label}</div>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/15 font-medium text-white shadow-inner"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-5 py-4">
      <Image src="/brand/mumtaz-isg-white.png" alt="Mumtaz Integrated Services Group" width={150} height={46}
             priority unoptimized className="h-8 w-auto" />
    </Link>
  );
}

export function SideNav({ divisions = [], activeDivision = null }: { divisions?: ServiceLine[]; activeDivision?: string | null }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 text-white lg:hidden">
        <Image src="/brand/mumtaz-isg-white.png" alt="Mumtaz ISG" width={130} height={40} unoptimized className="h-7 w-auto" />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-2 hover:bg-white/10">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-navy text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="mr-3 rounded p-2 hover:bg-white/10">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="pt-3"><DivisionSwitcher divisions={divisions} active={activeDivision} /></div>
            <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-navy text-white lg:flex">
        <div className="border-b border-white/10"><Brand /><div className="pt-2"><DivisionSwitcher divisions={divisions} active={activeDivision} /></div></div>
        <NavList pathname={pathname} />
        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">Mumtaz Operations Platform</div>
      </aside>
    </>
  );
}
