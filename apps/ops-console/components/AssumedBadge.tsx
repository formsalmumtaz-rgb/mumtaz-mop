// Warning badge shown next to any value seeded as ASSUMED (Art. X §4).
export function AssumedBadge({ note }: { note?: string | null }) {
  return (
    <span
      title={note ?? "Assumed value — confirm before relying on it"}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300"
    >
      <span aria-hidden>⚠</span> ASSUMED
    </span>
  );
}
