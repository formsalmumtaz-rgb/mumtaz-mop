import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  return rf.call(this, r, ...a);
};
const { extractCoords, resolveMapLink, reverseGeocodeParts } = await import("../lib/domain/maplink.ts");

console.log("── Google Maps links people actually paste ────────────────────");
const cases: [string, string][] = [
  ["place link with pin data", "https://www.google.com/maps/place/Al+Noor+Restaurant/@25.4052165,55.5136433,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f5!8m2!3d25.4052117!4d55.5162182!16s"],
  ["viewport-only link",       "https://www.google.com/maps/@25.276987,55.296249,15z"],
  ["?q= coordinates",          "https://maps.google.com/?q=25.2048,55.2708"],
  ["?ll= coordinates",         "https://www.google.com/maps?ll=24.4539,54.3773&z=14"],
  ["pasted coordinates",       "25.378096, 55.461512"],
  ["not a map link",           "https://example.com/some/page"],
];
for (const [label, url] of cases) {
  const c = extractCoords(url);
  console.log(`  ${label.padEnd(26)} ${c ? `${c.lat}, ${c.lng}` : "no coordinates (correct for the last one)"}`);
}

console.log("\n── A SHORT LINK, resolved by following it ─────────────────────");
const short = await resolveMapLink("https://maps.app.goo.gl/vHUZ2K5UdKQnDmXY6");
console.log(`  ${short ? `${short.lat}, ${short.lng}` : "could not resolve (network or link expired) — the form still works, pin stays empty"}`);

console.log("\n── REVERSE GEOCODE: components, never a plus code ─────────────");
for (const [label, loc] of [["Ajman base (25.378096, 55.461512)", { lat: 25.378096, lng: 55.461512 }],
                            ["a spot with no street number",      { lat: 25.4052117, lng: 55.5162182 }]] as const) {
  const p = await reverseGeocodeParts(loc);
  console.log(`\n  ${label}`);
  if (!p) { console.log("    (no key configured, or no result)"); continue; }
  console.log(`    street   : ${p.street ?? "—"}`);
  console.log(`    area     : ${p.area ?? "—"}`);
  console.log(`    district : ${p.district ?? "—"}`);
  console.log(`    emirate  : ${p.emirate ?? "—"}`);
  console.log(`    country  : ${p.country ?? "—"}`);
  console.log(`    PRINTED  : ${p.formatted ?? "—"}`);
  const bad = /\+/.test(p.formatted ?? "") || /(Ajman.*Sharjah|Sharjah.*Ajman)/i.test(p.formatted ?? "");
  console.log(`    ${bad ? "✗ still wrong" : "✓ no plus code, no doubled emirate"}`);
}
process.exit(0);
