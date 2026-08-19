"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setActiveDivisionAction } from "@/app/actions/division";
import type { ServiceLine } from "@/lib/domain/reference";

// Active-division picker. Auto-submits on change so every server flow that calls
// getServiceLineId() resolves to the chosen division (Art. XVIII — service-driven).
function DivisionSwitcher({ divisions, active, pathname }: { divisions: ServiceLine[]; active: string | null; pathname: string }) {
  if (divisions.length < 2) return null;
  const current = divisions.find((d) => d.code === active)?.code ?? divisions.find((d) => d.code === "pest_control")?.code ?? divisions[0].code;
  return (
    <form action={setActiveDivisionAction} className="px-5 pb-3">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gold">Division</label>
      <input type="hidden" name="redirect_to" value={pathname} />
      {/* keyed by `current` so the control always reflects the server-resolved
          division after each navigation — never shows a stale/reverted value */}
      <select key={current} name="division" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none">
        {divisions.map((d) => <option key={d.id} value={d.code} className="text-neutral-900">{d.name}</option>)}
      </select>
    </form>
  );
}

// Grouped, responsive navigation (Sales / Operations / Finance / Admin). Fixed
// sidebar on desktop; slide-in drawer on mobile. The flat 26-item bar did not
// scale — this groups by function so the daily tool reads like an instrument.
// Icons carry meaning (UI refresh 12): one stroke glyph per destination.
type Item = { href: string; label: string; icon?: string };
type Group = { label: string | null; items: Item[] };

// Minimal single-path stroke icons (24×24 viewBox paths).
const ICONS: Record<string, string> = {
  dashboard: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  search: "M21 21l-5-5m2-5a7 7 0 11-14 0 7 7 0 0114 0",
  customers: "M16 7a4 4 0 11-8 0 4 4 0 018 0M5 21v-1a7 7 0 0114 0v1",
  surveys: "M9 5h6M9 3h6v4H9zM5 7v14h14V7M9 13l2 2 4-4",
  estimates: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  contracts: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6",
  pipeline: "M4 6h16M7 12h10M10 18h4",
  schedule: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4",
  jobs: "M9 6V4h6v2m-9 3h12v10H6zM3 9h18",
  reports: "M6 3h9l4 4v14H6zM9 12l2 2 4-4",
  money: "M4 7h16v10H4zM12 10a2 2 0 100 4 2 2 0 000-4",
  stock: "M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6M19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2L14 21h-4l-.5-2.6a7 7 0 01-2-1.2l-2.4 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2L10 3h4l.5 2.6a7 7 0 012 1.2l2.4-1 2 3.4-2 1.6A7 7 0 0119 12",
};

const GROUPS: Group[] = [
  { label: null, items: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/search", label: "Search", icon: "search" },
  ] },
  { label: "Sales", items: [
    { href: "/customers", label: "Customers", icon: "customers" },
    { href: "/surveys", label: "Surveys", icon: "surveys" },
    { href: "/estimates", label: "Estimates", icon: "estimates" },
    { href: "/contracts", label: "Contracts", icon: "contracts" },
    { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  ] },
  { label: "Operations", items: [
    { href: "/schedule", label: "Schedule", icon: "schedule" },
    { href: "/schedule/approvals", label: "Schedule approval" },
    { href: "/jobs", label: "Jobs", icon: "jobs" },
    { href: "/jobs/new", label: "New job" },
    { href: "/service-reports", label: "Service reports", icon: "reports" },
    { href: "/field-review", label: "Field review" },
    { href: "/notifications", label: "Notifications" },
    { href: "/manpower", label: "Manpower" },
    { href: "/technicians", label: "Technicians" },
    { href: "/teams", label: "Teams" },
    { href: "/teams/crews", label: "Crews" },
    { href: "/vehicles", label: "Vehicles" },
    { href: "/stock", label: "Stock", icon: "stock" },
    { href: "/chemicals", label: "Manage items" },
    { href: "/purchases", label: "Purchases" },
    { href: "/recipes", label: "Treatment recipes" },
  ] },
  { label: "Finance", items: [
    { href: "/invoices", label: "Invoices", icon: "money" },
    { href: "/billing", label: "Billing" },
    { href: "/receipts", label: "Receipts" },
    { href: "/credit-notes", label: "Credit notes" },
    { href: "/ar", label: "Receivables" },
    { href: "/expenses", label: "Expenses" },
    { href: "/cash-flow", label: "Cash flow" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/profitability", label: "Profitability" },
    { href: "/management", label: "Management" },
  ] },
  { label: "Admin", items: [
    { href: "/assistant", label: "Ask the business" },
    { href: "/settings/divisions", label: "Divisions" },
    { href: "/categories", label: "Service categories" },
    { href: "/pricing", label: "Pricing models" },
    { href: "/cost-config", label: "Cost setup" },
    { href: "/settings/field-definitions", label: "Form questions" },
    { href: "/settings/master-data", label: "Master data" },
    { href: "/imports", label: "Import customers" },
    { href: "/settings", label: "Settings", icon: "settings" },
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
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                      active
                        ? "border-l-2 border-gold bg-white/15 font-medium text-white shadow-inner"
                        : "border-l-2 border-transparent text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {it.icon && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                           strokeLinecap="round" strokeLinejoin="round" className={active ? "text-gold" : "opacity-60"}>
                        <path d={ICONS[it.icon]} />
                      </svg>
                    )}
                    <span className={it.icon ? "" : "pl-[25px]"}>{it.label}</span>
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

export function SideNav({ divisions = [], activeDivision = null, commit }: { divisions?: ServiceLine[]; activeDivision?: string | null; commit?: string }) {
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
            <div className="pt-3"><DivisionSwitcher divisions={divisions} active={activeDivision} pathname={pathname} /></div>
            <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-navy text-white lg:flex">
        <div className="border-b border-white/10"><Brand /><div className="pt-2"><DivisionSwitcher divisions={divisions} active={activeDivision} pathname={pathname} /></div></div>
        <NavList pathname={pathname} />
        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">Mumtaz Operations Platform{commit ? ` · build ${commit}` : ""}</div>
      </aside>
    </>
  );
}
