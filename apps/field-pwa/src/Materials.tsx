import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, enqueue, uuid, type ExpectedDose, type LocalJob } from "./db";

// DEFECT 2B/2C/2D — the chemical screen the owner asked for, in the order the
// technician actually needs it:
//   1. WHAT THEY SHOULD USE, before they treat. In words, not a formula.
//   2. WHAT THEY DID USE. Pre-filled with the expected amount, because that is
//      the truth most days and re-typing a number the system already knows is
//      exactly what Art. VI forbids.
//   3. A SOFT warning when the actual runs far over. It is never a block —
//      the owner's instruction, repeated: a technician who genuinely needed
//      three mixes must be able to say so and get on with the day.
//   4. WHAT IS LEFT IN THE VAN, on the same screen, updating as they type.
//
// Offline throughout. The expected dose arrives with the job; the recorded use
// leaves through the outbox. Nothing here needs a network round-trip.

interface Row {
  key: string;
  item_id: string;
  name: string;
  unit: string;
  expected_qty: number | null;
  actual: string;
  mixes: string;
  ml_per_mix: string;
  substituted_for_item_id: string | null;
  is_adjuvant: boolean;
  note: string;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function MaterialsCard({ job, warnOverPct = 100 }: { job: LocalJob; warnOverPct?: number }) {
  const exp: ExpectedDose | null = job.expected ?? null;
  const declared = useLiveQuery(async () =>
    ((await db.meta.get("declaredStock"))?.value as { item_id: string; item: string; unit: string; declared: number }[] | undefined) ?? [], [], []);
  const equipOptions = useLiveQuery(async () =>
    ((await db.meta.get("equipmentOptions"))?.value as { code: string; label: string }[] | undefined) ?? [], [], []);
  // Everything already recorded today, so "left in the van" is honest even
  // before the outbox has drained.
  const recordedToday = useLiveQuery(async () => {
    const out = await db.outbox.toArray();
    const byItem: Record<string, number> = {};
    for (const ev of out) {
      if (ev.event_type !== "job.materials_recorded") continue;
      const lines = (ev.payload as { lines?: { item_id: string; actual_qty: number }[] }).lines ?? [];
      for (const l of lines) byItem[l.item_id] = (byItem[l.item_id] ?? 0) + Number(l.actual_qty || 0);
    }
    return byItem;
  }, [], {} as Record<string, number>);

  const alreadyRecorded = useLiveQuery(async () =>
    (await db.outbox.where("job_id").equals(job.id).toArray())
      .some((e) => e.event_type === "job.materials_recorded"), [job.id], false);

  const [rows, setRows] = useState<Row[]>(() => seedRows(exp));
  const [equipment, setEquipment] = useState<Record<string, boolean>>({});
  const [ack, setAck] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swapFor, setSwapFor] = useState<string | null>(null);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // Mixes ± must survive a fast double-tap: derive the new count from the row as
  // it stands in state, not from the copy this render closed over.
  const stepMixes = (key: string, by: number) =>
    setRows((all) => all.map((r) => {
      if (r.key !== key) return r;
      const m = Math.max(0, Number(r.mixes || 0) + by);
      return { ...r, mixes: String(m), actual: String(money(m * Number(r.ml_per_mix || 0))) };
    }));

  // The main chemical row drives mixes; adjuvants follow the water volume.
  const main = rows.find((r) => !r.is_adjuvant);
  const mainTotal = main ? Number(main.actual || 0) : 0;
  const expectedMain = exp?.total_qty ?? null;
  const water = useMemo(() => {
    if (!exp?.water_litres || !exp?.total_qty || !mainTotal) return exp?.water_litres ?? null;
    return money((exp.water_litres / exp.total_qty) * mainTotal);
  }, [exp, mainTotal]);

  // 2C — the two things worth warning about, both SOFT.
  const overExpected = expectedMain != null && expectedMain > 0
    && mainTotal > expectedMain * (1 + warnOverPct / 100);
  const overCap = exp?.cap_qty != null && mainTotal > exp.cap_qty;
  const warn = overExpected || overCap;

  const stockFor = (itemId: string): { unit: string; left: number } | null => {
    const d = declared.find((x) => x.item_id === itemId);
    if (!d) return null;
    const usedElsewhere = recordedToday[itemId] ?? 0;
    const thisScreen = rows.filter((r) => r.item_id === itemId).reduce((s, r) => s + Number(r.actual || 0), 0);
    return { unit: d.unit, left: money(d.declared - usedElsewhere - thisScreen) };
  };

  const save = async () => {
    const lines = rows
      .filter((r) => Number(r.actual || 0) > 0)
      .map((r) => ({
        client_uuid: uuid(),
        item_id: r.item_id,
        recipe_version_id: exp?.recipe_version_id ?? null,
        expected_qty: r.expected_qty,
        actual_qty: Number(r.actual),
        mixes: r.is_adjuvant || !r.mixes ? null : Number(r.mixes),
        water_litres: r.is_adjuvant ? null : water,
        substituted_for_item_id: r.substituted_for_item_id,
        over_expected_ack: r.is_adjuvant ? false : warn,
        note: r.note.trim() || null,
      }));
    if (lines.length === 0) return;
    await enqueue("job.materials_recorded", job.id, {
      job_id: job.id,
      client_uuid: uuid(),
      device_time: new Date().toISOString(),
      lines,
      equipment: Object.entries(equipment).filter(([, on]) => on)
        .map(([code]) => ({ client_uuid: uuid(), equipment_code: code })),
    });
    setSaved(true);
  };

  return (
    <div className="card">
      <h3>Chemicals used</h3>

      {/* ── 1. WHAT THEY SHOULD USE ─────────────────────────────────── */}
      <div style={{ background: "#f2f7f2", border: "1px solid #cfe0cf", borderRadius: 10,
                    padding: ".7rem .8rem", marginBottom: ".9rem" }}>
        <div style={{ fontSize: ".72rem", letterSpacing: ".06em", color: "#4d6b4d", fontWeight: 700 }}>EXPECTED</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, margin: ".25rem 0 .4rem" }}>
          {exp?.why ?? "The office has not set a recipe for this job. Record what you used and they will."}
        </div>
        {exp?.product && (
          <div style={{ fontSize: ".9rem" }}>
            {exp.total_qty} {exp.product.unit} <b>{exp.product.name}</b>
            {exp.adjuvants.map((a) => (
              <span key={a.item_id}> + {a.qty} {a.unit} <b>{a.name}</b></span>
            ))}
            {exp.water_litres ? ` in ${exp.water_litres} L water` : ""}
          </div>
        )}
        {exp?.cap_qty != null && (
          <div className="muted" style={{ fontSize: ".78rem", marginTop: ".3rem" }}>
            Ceiling for this size of job: {exp.cap_qty} {exp.product?.unit ?? "ml"}.
          </div>
        )}
      </div>

      {saved ? (
        <p style={{ color: "#2f6d2f", fontWeight: 600 }}>
          Recorded ✓ — {rows.filter((r) => Number(r.actual || 0) > 0).length} product
          {rows.filter((r) => Number(r.actual || 0) > 0).length === 1 ? "" : "s"} queued. It will reach the office at the next sync.
        </p>
      ) : (
        <>
          <div style={{ fontSize: ".72rem", letterSpacing: ".06em", color: "#8a6d3b", fontWeight: 700, marginBottom: ".4rem" }}>
            WHAT YOU ACTUALLY USED
          </div>
          {alreadyRecorded && (
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 0 }}>
              You have already recorded chemicals for this job. Anything you add here is recorded as well, not instead — nothing is overwritten.
            </p>
          )}

          {rows.map((r) => {
            const stock = stockFor(r.item_id);
            const alts = !r.is_adjuvant ? exp?.alternatives ?? [] : [];
            return (
              <div key={r.key} style={{ padding: ".6rem 0", borderBottom: "1px solid #f0ece6" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>
                    {r.name}
                    {r.substituted_for_item_id && (
                      <span className="muted" style={{ fontWeight: 400, fontSize: ".78rem" }}> (instead of {exp?.product?.name})</span>
                    )}
                  </span>
                  {r.expected_qty != null && (
                    <span className="muted" style={{ fontSize: ".78rem" }}>expected {r.expected_qty} {r.unit}</span>
                  )}
                </div>

                {!r.is_adjuvant && (
                  <div className="row" style={{ gap: ".5rem", marginTop: ".45rem", alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: ".8rem", minWidth: "3.2rem" }}>Mixes</span>
                    <button type="button" className="ghost" style={{ width: 52, minHeight: 52, fontSize: "1.3rem", padding: 0 }}
                      onClick={() => stepMixes(r.key, -1)}>−</button>
                    <span style={{ fontSize: "1.3rem", fontWeight: 700, minWidth: "2rem", textAlign: "center" }}>{r.mixes || 0}</span>
                    <button type="button" className="ghost" style={{ width: 52, minHeight: 52, fontSize: "1.3rem", padding: 0 }}
                      onClick={() => stepMixes(r.key, +1)}>+</button>
                    <span className="muted" style={{ fontSize: ".8rem" }}>× {r.ml_per_mix || 0} {r.unit}</span>
                  </div>
                )}

                <label className="muted" style={{ display: "block", fontSize: ".8rem", marginTop: ".45rem" }}>
                  Total used ({r.unit})
                  <input type="number" inputMode="decimal" value={r.actual}
                    onChange={(e) => setRow(r.key, { actual: e.target.value })}
                    style={{ fontSize: "1.15rem", minHeight: 52 }} />
                </label>

                {stock && (
                  <div className="muted" style={{ fontSize: ".78rem", marginTop: ".25rem",
                                                  color: stock.left < 0 ? "#b91c1c" : undefined }}>
                    In the van after this: <b>{stock.left}</b> {stock.unit}
                    {stock.left < 0 && " — that is more than was counted this morning. It is recorded either way; tell the office."}
                  </div>
                )}

                {alts.length > 0 && (
                  <div style={{ marginTop: ".45rem" }}>
                    <button type="button" className="ghost"
                      style={{ width: "auto", padding: ".4rem .7rem", minHeight: 44, fontSize: ".8rem" }}
                      onClick={() => setSwapFor(swapFor === r.key ? null : r.key)}>
                      {swapFor === r.key ? "Keep this one" : "I used a different product"}
                    </button>
                    {swapFor === r.key && (
                      <div className="row" style={{ flexWrap: "wrap", gap: ".4rem", marginTop: ".4rem" }}>
                        {[{ item_id: exp!.product!.item_id, name: exp!.product!.name, unit: exp!.product!.unit }, ...alts].map((a) => (
                          <button key={a.item_id} type="button"
                            className={r.item_id === a.item_id ? "" : "ghost"}
                            style={{ width: "auto", padding: ".5rem .8rem", minHeight: 48 }}
                            onClick={() => {
                              setRow(r.key, {
                                item_id: a.item_id, name: a.name, unit: a.unit,
                                substituted_for_item_id: a.item_id === exp!.product!.item_id ? null : exp!.product!.item_id,
                              });
                              setSwapFor(null);
                            }}>{a.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {water != null && (
            <p className="muted" style={{ fontSize: ".82rem", marginTop: ".6rem" }}>
              That is <b>{water} L</b> of water at the recipe's dilution.
            </p>
          )}

          {/* ── 3. THE SOFT WARNING. Confirms, never blocks. ─────────── */}
          {warn && (
            <div style={{ background: "#fdf6e3", border: "1px solid #e6d3a3", borderRadius: 10,
                          padding: ".7rem .8rem", margin: ".6rem 0" }}>
              <div style={{ fontWeight: 700, color: "#8a6d3b" }}>That is more than expected</div>
              <div style={{ fontSize: ".88rem", marginTop: ".25rem" }}>
                {overCap
                  ? `The ceiling for this job is ${exp?.cap_qty} ${exp?.product?.unit ?? "ml"} and you have entered ${mainTotal}.`
                  : `The recipe expects ${expectedMain} ${exp?.product?.unit ?? "ml"} and you have entered ${mainTotal}.`}
                {" "}If that is what the site needed, say so and carry on — the office will see the reason.
              </div>
              <label className="row" style={{ gap: ".5rem", marginTop: ".5rem", alignItems: "center" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
                  style={{ width: 26, height: 26 }} />
                <span style={{ fontSize: ".88rem" }}>Yes, the site needed it</span>
              </label>
              <input placeholder="Why? (heavy infestation, larger area…)" value={main?.note ?? ""}
                onChange={(e) => main && setRow(main.key, { note: e.target.value })}
                style={{ marginTop: ".45rem", width: "100%", minHeight: 52 }} />
            </div>
          )}

          {/* ── Equipment used ───────────────────────────────────────── */}
          {equipOptions.length > 0 && (
            <>
              <div style={{ fontSize: ".72rem", letterSpacing: ".06em", color: "#8a6d3b",
                            fontWeight: 700, margin: ".8rem 0 .4rem" }}>EQUIPMENT USED</div>
              <div className="row" style={{ flexWrap: "wrap", gap: ".4rem" }}>
                {equipOptions.map((e) => (
                  <button key={e.code} type="button" className={equipment[e.code] ? "" : "ghost"}
                    style={{ width: "auto", padding: ".5rem .8rem", minHeight: 52 }}
                    onClick={() => setEquipment((all) => ({ ...all, [e.code]: !all[e.code] }))}>
                    {equipment[e.code] ? "✓ " : ""}{e.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <button onClick={save} style={{ marginTop: ".9rem" }}
            disabled={rows.every((r) => !(Number(r.actual || 0) > 0))}>
            Record what I used
          </button>
          <p className="muted" style={{ fontSize: ".78rem", marginTop: ".4rem" }}>
            Saved on this phone straight away. It reaches the office when there is signal.
          </p>
        </>
      )}
    </div>
  );
}

// The actual starts pre-filled with the expected. Most days that is the truth,
// and Art. VI is explicit: never ask for what the system already knows.
function seedRows(exp: ExpectedDose | null): Row[] {
  if (!exp?.product) return [];
  const main: Row = {
    key: "main", item_id: exp.product.item_id, name: exp.product.name, unit: exp.product.unit,
    expected_qty: exp.total_qty, actual: exp.total_qty != null ? String(exp.total_qty) : "",
    mixes: exp.mixes != null ? String(exp.mixes) : "",
    ml_per_mix: exp.ml_per_mix != null ? String(exp.ml_per_mix) : "",
    substituted_for_item_id: null, is_adjuvant: false, note: "",
  };
  const adj = exp.adjuvants.map((a, i) => ({
    key: `adj${i}`, item_id: a.item_id, name: a.name, unit: a.unit,
    expected_qty: a.qty, actual: String(a.qty), mixes: "", ml_per_mix: "",
    substituted_for_item_id: null, is_adjuvant: true, note: "",
  }));
  return [main, ...adj];
}
