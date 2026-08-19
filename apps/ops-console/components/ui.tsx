import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";

// Brand-styled UI primitives (Priority 2). One place defines how a button, field,
// card, badge and table look, so screens read as one system. Pure styling — no
// state, server-component friendly. Adopt incrementally across pages (two-speed).

function cx(...v: (string | false | null | undefined)[]) { return v.filter(Boolean).join(" "); }

// ── Button ──
type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
type BtnSize = "sm" | "md";
const BTN_BASE = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none";
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-dark hover:shadow",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
};
const BTN_SIZE: Record<BtnSize, string> = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };

export function Button({ variant = "primary", size = "md", className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return <button className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} {...props} />;
}

// Link that looks like a button (for navigation actions).
export function ButtonLink({ href, variant = "secondary", size = "md", className, children }:
  { href: string; variant?: BtnVariant; size?: BtnSize; className?: string; children: ReactNode }) {
  return <Link href={href} className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}>{children}</Link>;
}

// ── Form controls ──
const FIELD = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-neutral-100 disabled:text-neutral-500";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD, className)} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(FIELD, "appearance-none bg-[length:1rem] pr-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, className)} {...props} />;
}

// Labelled field wrapper.
export function Field({ label, hint, highlight, children }:
  { label: string; hint?: string; highlight?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className={highlight ? "font-medium text-amber-700" : "text-neutral-600"}>{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

// ── Card ──
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-lg border border-neutral-200 bg-white", className)}>{children}</div>;
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("p-4 sm:p-5", className)}>{children}</div>;
}

// ── Badge ──
type BadgeTone = "neutral" | "brand" | "navy" | "success" | "warning" | "danger";
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  brand: "bg-brand/10 text-brand ring-brand/20",
  navy: "bg-navy/10 text-navy ring-navy/20",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  warning: "bg-amber-100 text-amber-800 ring-amber-300",
  danger: "bg-red-100 text-red-700 ring-red-300",
};
export function Badge({ tone = "neutral", className, children }:
  { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", BADGE_TONE[tone], className)}>{children}</span>;
}

// ── Table ──
export function TableWrap({ minWidth, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="card-lift max-h-[70vh] overflow-auto rounded-lg border border-neutral-200 bg-white">
      {/* §3.9: sticky headers — the office scrolls hundreds of rows and forgets
          which column is which. One place, so every table gets it. */}
      <table className="sticky-head w-full text-sm" style={minWidth ? { minWidth } : undefined}>{children}</table>
    </div>
  );
}
export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">{children}</thead>;
}
export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-neutral-100">{children}</tbody>;
}

// ── Page header ──
export function PageHeader({ title, description, actions }:
  { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── §3.9 — shared pieces the refresh introduces ─────────────────────────────

// A status pill. Tone is meaning, never decoration: the same state always looks
// the same on every screen, so the office reads colour rather than words.
export function StatusPill({ tone, children }: {
  tone: "ok" | "warn" | "bad" | "info"; children: React.ReactNode;
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

// An empty state that offers the one thing to do next, rather than apologising.
export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Placeholder rows that hold the layout still while data arrives, so the page
// does not jump under the pointer.
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-2">
              <div className="skeleton h-4" style={{ width: `${55 + ((r + c) % 4) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
