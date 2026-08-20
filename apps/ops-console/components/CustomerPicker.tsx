"use client";
import { useMemo, useRef, useState } from "react";

// Item 2 — the same customer picker everywhere a customer is chosen.
//
// It replaced a <select> holding 583 <option>s. That control cannot be used: to
// reach "Al Noor" you scroll, and to know you have the right Al Noor you need
// the account number, which was not in the label. Every letter filters here, the
// account number sits beside the name, and the account number itself is
// searchable — because that is what people read off a contract.
export interface PickCustomer { id: string; code: string | null; trade_name: string | null; legal_name?: string | null }

export function CustomerPicker({
  customers, name = "customer_id", required = false, defaultValue = "",
  label = "Customer", placeholder = "Type a name or account number…",
}: {
  customers: PickCustomer[]; name?: string; required?: boolean; defaultValue?: string;
  label?: string; placeholder?: string;
}) {
  const initial = customers.find((c) => c.id === defaultValue) ?? null;
  const [chosen, setChosen] = useState<PickCustomer | null>(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const nameOf = (c: PickCustomer) => c.trade_name ?? c.legal_name ?? "(no name)";
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers.slice(0, 50);
    // Account-number matches first: someone typing digits is reading a contract.
    const byCode = customers.filter((c) => (c.code ?? "").toLowerCase().startsWith(s));
    const inCode = new Set(byCode.map((c) => c.id));
    const byName = customers.filter((c) => !inCode.has(c.id) && nameOf(c).toLowerCase().includes(s));
    return [...byCode, ...byName].slice(0, 50);
  }, [q, customers]);

  const choose = (c: PickCustomer) => { setChosen(c); setQ(""); setOpen(false); };

  return (
    <div className="text-sm" ref={boxRef}>
      <span className="text-xs font-medium text-muted">{label}{required && " *"}</span>
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.04] px-3 py-2">
          {chosen.code && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-neutral-600">{chosen.code}</span>}
          <span className="font-medium">{nameOf(chosen)}</span>
          <button type="button" onClick={() => { setChosen(null); setOpen(true); }}
                  className="ml-auto text-xs text-brand underline">change</button>
        </div>
      ) : (
        <div className="relative mt-1">
          <input
            value={q} placeholder={placeholder} autoComplete="off"
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
              else if (e.key === "Escape") setOpen(false);
            }}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {open && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-lg">
              {matches.length === 0 && (
                <li className="px-3 py-3 text-xs text-muted">
                  Nothing matches &ldquo;{q}&rdquo;. Leave this empty and fill the new-customer block instead.
                </li>
              )}
              {matches.map((c, i) => (
                <li key={c.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === active ? "bg-brand/[0.06]" : ""}`}>
                    <span className="w-14 shrink-0 font-mono text-xs text-neutral-500">{c.code ?? "—"}</span>
                    <span className="truncate">{nameOf(c)}</span>
                  </button>
                </li>
              ))}
              {matches.length === 50 && (
                <li className="border-t border-line px-3 py-2 text-[11px] text-muted">
                  Showing the first 50 — keep typing to narrow it.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
