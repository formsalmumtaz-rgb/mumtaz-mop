"use client";
import { useRouter } from "next/navigation";
import type { ReactNode, KeyboardEvent, MouseEvent } from "react";

// ROW = THE RECORD. Clicking anywhere in a list row opens THAT record's detail —
// not the customer, not anything else. §3.2 of the queue: the customer name inside
// a row used to be a link that hijacked the click to the customer profile, so a
// user aiming at an invoice landed on a customer. The name is now plain text; the
// "View customer profile" link lives inside the record's own detail page.
//
// Anything genuinely interactive nested in the row (an explicit link, a button,
// a form control) still wins the click — the guard below defers to it — so a row
// can still carry a "12 jobs" drill-down without fighting the row itself.
export function RowLink({ href, children, className = "" }: {
  href: string; children: ReactNode; className?: string;
}) {
  const router = useRouter();
  const isInteractive = (t: EventTarget | null) =>
    t instanceof HTMLElement && t.closest("a,button,input,select,textarea,label");

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`Open ${href}`}
      onClick={(e: MouseEvent<HTMLTableRowElement>) => {
        if (isInteractive(e.target)) return;
        // cmd/ctrl-click and middle-click keep their "open elsewhere" meaning
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLTableRowElement>) => {
        if (isInteractive(e.target)) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(href); }
      }}
      className={`cursor-pointer transition-colors hover:bg-brand/[0.04] focus:bg-brand/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 ${className}`}
    >
      {children}
    </tr>
  );
}
