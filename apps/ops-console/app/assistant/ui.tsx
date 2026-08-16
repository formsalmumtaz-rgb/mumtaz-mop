"use client";

import { useState } from "react";
import { createEstimateFromDraftAction } from "./actions";

interface Turn { role: "you" | "assistant"; text: string }
interface Draft { intro: string; scope_of_work: string[]; line_items: { description: string }[] }

// Item 5 — the chat panel. Two modes: ask (data questions) and draft
// (quotation content for an untemplated scope). Plain fetch, no streaming —
// answers are short and the panel is a low-frequency admin tool.
export function AssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"ask" | "draft_quotation">("ask");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput("");
    setTurns((t) => [...t, { role: "you", text: question }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, question }),
      });
      const data = (await res.json()) as { answer?: string; draft?: Draft; error?: string };
      if (data.error) {
        setTurns((t) => [...t, { role: "assistant", text: `⚠ ${data.error}` }]);
      } else if (data.draft) {
        setDraft(data.draft);
        setTurns((t) => [...t, { role: "assistant", text: "Draft ready below — review it, then carry it into a quotation. Pricing still runs through the estimate engine; the draft carries no numbers." }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", text: data.answer ?? "" }]);
      }
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "⚠ Request failed — check the connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2 text-sm">
        <button onClick={() => setMode("ask")}
          className={`rounded-full px-3 py-1.5 ${mode === "ask" ? "bg-brand text-white" : "border border-neutral-300 hover:bg-neutral-50"}`}>
          Ask the business
        </button>
        <button onClick={() => setMode("draft_quotation")}
          className={`rounded-full px-3 py-1.5 ${mode === "draft_quotation" ? "bg-brand text-white" : "border border-neutral-300 hover:bg-neutral-50"}`}>
          Draft a quotation scope
        </button>
      </div>

      <div className="space-y-3">
        {turns.length === 0 && (
          <p className="text-sm text-neutral-500">
            {mode === "ask"
              ? "Try: “How many technicians attended today?” · “Which invoices are unpaid past terms?” · “What happened at Calicut last visit?”"
              : "Describe the job in plain words — e.g. “bird netting for a warehouse roof in Sharjah, one-time, includes removal of nests and disinfection” — and get intro, scope of work and line items drafted."}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`rounded-lg border p-3 text-sm whitespace-pre-wrap ${t.role === "you" ? "border-neutral-200 bg-neutral-50" : "border-brand/20 bg-white"}`}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{t.role === "you" ? "You" : "Assistant"}</div>
            {t.text}
          </div>
        ))}
        {busy && <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-400">Thinking…</div>}
      </div>

      {draft && (
        <div className="rounded-lg border border-brand/30 bg-white p-4 text-sm space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">Quotation draft (content only — no prices)</div>
          <p className="whitespace-pre-wrap">{draft.intro}</p>
          <div>
            <div className="font-medium">Scope of work</div>
            <ul className="mt-1 list-disc pl-5">{draft.scope_of_work.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <div className="font-medium">Line items</div>
            <ol className="mt-1 list-decimal pl-5">{draft.line_items.map((l, i) => <li key={i}>{l.description}</li>)}</ol>
          </div>
          <form action={createEstimateFromDraftAction} className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
            <input type="hidden" name="intro" value={draft.intro} />
            {draft.scope_of_work.map((s, i) => <input key={`s${i}`} type="hidden" name="scope" value={s} />)}
            {draft.line_items.map((l, i) => <input key={`l${i}`} type="hidden" name="line" value={l.description} />)}
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
              Create a draft estimate from this
            </button>
            <span className="text-xs text-neutral-500">
              Creates a DRAFT estimate carrying this wording and no prices — you price the lines through the engines, then issue the quotation as usual.
            </span>
          </form>
        </div>
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "ask" ? "Ask about today's operations, money, customers…" : "Describe the scope to draft…"}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
        <button type="submit" disabled={busy || !input.trim()}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}
