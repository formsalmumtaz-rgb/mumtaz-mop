"use client";
import { useRef, useState } from "react";

// Flow item 8: setting the start date auto-fills the end date to +364 days (a
// standard 1-year term), still fully editable. Touching the end date by hand
// stops the auto-fill.
const plus364 = (start: string): string => {
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 364);
  return d.toISOString().slice(0, 10);
};

export function TermDates({ startDefault, endDefault, className }: { startDefault: string; endDefault: string; className: string }) {
  const [start, setStart] = useState(startDefault);
  const [end, setEnd] = useState(endDefault);
  const endTouched = useRef(false);
  return (
    <>
      <label className="text-sm"><span className="text-neutral-600">Start date</span>
        <input name="start_date" type="date" value={start} className={className}
          onChange={(e) => {
            setStart(e.target.value);
            if (!endTouched.current && e.target.value) setEnd(plus364(e.target.value));
          }} /></label>
      <label className="text-sm"><span className="text-neutral-600">End date</span>
        <input name="end_date" type="date" value={end} className={className}
          onChange={(e) => { endTouched.current = true; setEnd(e.target.value); }} />
        <span className="mt-0.5 block text-xs text-neutral-400">auto-fills to start + 364 days — edit freely</span></label>
    </>
  );
}
