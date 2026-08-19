"use client";
import { useState, useTransition } from "react";
import type { Crew, CrewMember, CrewVehicle } from "@/lib/domain/crews";

// §3.4 — drag a technician or a van onto a crew. Drop is the whole interaction;
// there is no save button, because a half-made assignment is worse than none.
//
// Every card is also a plain <select> fallback: the office may be on a tablet, and
// HTML5 drag-and-drop does not exist on touch. The drag is the fast path, not the
// only path.
type Item = { id: string; label: string; sub: string | null; kind: "technician" | "vehicle"; lead?: boolean };

export function CrewBoard({ crews, unassignedTechs, unassignedVehicles, assign }: {
  crews: Crew[]; unassignedTechs: CrewMember[]; unassignedVehicles: CrewVehicle[];
  assign: (fd: FormData) => Promise<void>;
}) {
  const [dragging, setDragging] = useState<Item | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const move = (item: Item, teamId: string | null) => {
    const fd = new FormData();
    fd.set("kind", item.kind); fd.set("id", item.id);
    if (teamId) fd.set("team_id", teamId);
    start(() => { void assign(fd); });
  };

  const Card = ({ item }: { item: Item }) => (
    <div
      draggable
      onDragStart={() => setDragging(item)}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      className={`cursor-grab rounded border bg-white px-2.5 py-1.5 text-sm shadow-sm active:cursor-grabbing
                  ${item.kind === "vehicle" ? "border-sky-200" : "border-neutral-200"}`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden>{item.kind === "vehicle" ? "🚐" : "👤"}</span>
        <span className="font-medium text-neutral-800">{item.label}</span>
        {item.lead && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">lead</span>}
      </div>
      {item.sub && <div className="mt-0.5 pl-5 text-xs text-neutral-500">{item.sub}</div>}
    </div>
  );

  const Zone = ({ id, title, subtitle, items, tone }: {
    id: string | null; title: string; subtitle?: string; items: Item[]; tone: "team" | "pool";
  }) => {
    const key = id ?? "__pool";
    const active = over === key && dragging !== null;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(key); }}
        onDragLeave={() => setOver((o) => (o === key ? null : o))}
        onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, id); setDragging(null); setOver(null); }}
        className={`rounded-lg border p-3 transition-colors
          ${tone === "team" ? "border-neutral-200 bg-neutral-50/60" : "border-dashed border-neutral-300 bg-white"}
          ${active ? "border-brand bg-brand/5 ring-2 ring-brand/30" : ""}`}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">{title}</h3>
          <span className="text-xs text-neutral-500">{items.length}</span>
        </div>
        {subtitle && <p className="mb-2 text-xs text-neutral-500">{subtitle}</p>}
        <div className="space-y-1.5">
          {items.length === 0 && <p className="py-3 text-center text-xs text-neutral-400">drop here</p>}
          {items.map((it) => (
            <div key={it.id}>
              <Card item={it} />
              <select
                aria-label={`Move ${it.label}`}
                value={id ?? ""}
                onChange={(e) => move(it, e.target.value || null)}
                className="mt-1 w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-600"
              >
                <option value="">— no crew —</option>
                {crews.map((c) => <option key={c.team_id} value={c.team_id}>{c.team_name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const techItem = (m: CrewMember): Item =>
    ({ id: m.id, label: m.full_name, sub: m.phone, kind: "technician", lead: m.is_team_lead });
  const vehItem = (v: CrewVehicle): Item =>
    ({ id: v.id, label: v.name ?? v.code ?? "Vehicle", sub: v.plate, kind: "vehicle" });

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Zone id={null} tone="pool" title="Not on a crew"
              subtitle="Anyone here is available but not rostered."
              items={[...unassignedTechs.map(techItem), ...unassignedVehicles.map(vehItem)]} />
        {crews.map((c) => (
          <Zone key={c.team_id} id={c.team_id} tone="team" title={c.team_name}
                subtitle={c.vehicles.length === 0 ? "No van assigned." : undefined}
                items={[...c.members.map(techItem), ...c.vehicles.map(vehItem)]} />
        ))}
      </div>
    </div>
  );
}
