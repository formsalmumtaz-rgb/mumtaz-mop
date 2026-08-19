import type { ReactNode } from "react";

// DEFECT 3 — one back control, in one place, on every screen that is not the
// day view. It lives IN the sticky bar at the top-left, is 52px square, and is
// the same on every screen: a technician should never have to hunt for the way
// out, and should never learn a different gesture per screen.
//
// The hardware/browser back button is also wired (App.tsx) so the phone's own
// back gesture does the same thing — but it is not enough on its own: the PWA
// runs full-screen from the home icon, where there is no browser chrome.
export function ScreenBar({ title, onBack, right }: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="bar">
      <div style={{ display: "flex", alignItems: "center", gap: ".2rem", minWidth: 0 }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back"
            style={{ width: 52, minHeight: 52, padding: 0, margin: "-.35rem .1rem -.35rem -.55rem",
                     background: "rgba(255,255,255,.16)", color: "#fff", border: "none",
                     borderRadius: ".6rem", fontSize: "1.5rem", lineHeight: 1, flex: "0 0 auto" }}>
            ←
          </button>
        )}
        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
      </div>
      {right}
    </div>
  );
}
