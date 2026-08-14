"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Vision P3 — ⌘K / Ctrl+K command palette. One box: type → Enter lands on the
// global search (customers, contracts, invoices, phone numbers); the quick
// actions below jump straight to the daily destinations. Zero network until
// the user commits — the search page does the querying.
const ACTIONS: { label: string; href: string; hint: string }[] = [
  { label: "New customer", href: "/customers", hint: "C" },
  { label: "New survey", href: "/surveys", hint: "S" },
  { label: "New estimate", href: "/estimates", hint: "E" },
  { label: "Raise invoice", href: "/invoices", hint: "I" },
  { label: "Record payment", href: "/receipts", hint: "P" },
  { label: "Issue stock", href: "/stock", hint: "K" },
  { label: "Schedule", href: "/schedule", hint: "H" },
  { label: "Daily report", href: "/reports/daily", hint: "D" },
];

export function CommandK() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  if (!open) return null;
  const filtered = q.trim() === "" ? ACTIONS : ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[18vh]" onClick={() => setOpen(false)}>
      <div className="fade-in w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, contracts, invoices, phone numbers…"
            className="w-full rounded-t-xl border-b border-neutral-200 px-5 py-4 text-sm outline-none" />
        </form>
        <ul className="max-h-72 overflow-y-auto py-2">
          {q.trim() !== "" && (
            <li>
              <button onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
                className="flex w-full items-center justify-between px-5 py-2.5 text-sm hover:bg-brand/5">
                <span>Search everything for <b>“{q.trim()}”</b></span>
                <span className="text-xs text-neutral-400">↵</span>
              </button>
            </li>
          )}
          {filtered.map((a) => (
            <li key={a.href + a.label}>
              <button onClick={() => go(a.href)}
                className="flex w-full items-center justify-between px-5 py-2.5 text-sm hover:bg-brand/5">
                <span>{a.label}</span>
                <span className="rounded border border-neutral-200 px-1.5 text-[10px] text-neutral-400">{a.hint}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && q.trim() === "" && null}
        </ul>
        <div className="rounded-b-xl border-t border-neutral-100 px-5 py-2 text-[11px] text-neutral-400">
          ⌘K to toggle · Enter searches customers, contracts, invoices and phone numbers · Esc closes
        </div>
      </div>
    </div>
  );
}
