// CUSTOMER_Master_MOP.xlsx → the importer's canonical CSV (Art. VII §5).
//
// This is a TRANSLATION step only: it renames the master file's column headers to
// the importer's vocabulary and writes them out verbatim. It never fills a blank,
// never normalises a value, and never drops a column — MAPS_LINK_COORDS is carried
// through so the importer reports it as an unknown header rather than this script
// silently discarding it.
//
//   node --import tsx apps/ops-console/scripts/xlsx-to-import-csv.ts
import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";

const SRC = "merge/CUSTOMER_Master_MOP.xlsx";
const OUT = "merge/customer-master-import.csv";

// Master-file header → importer canonical column. Every one of the 24 columns is
// listed, so an unmapped header is a loud failure rather than a silent drop.
const HEADER_MAP: Record<string, string> = {
  ACCOUNT_NO: "account_no", CUSTOMER_NAME: "customer_name", ALIAS: "alias",
  CUSTOMER_GROUP: "customer_group", LEGACY_CODES: "legacy_codes",
  CONTRACT_NUMBERS: "contract_numbers", CONTRACT_SL_NOS: "contract_sl_nos",
  EMIRATE: "emirate", PLACE_OF_SUPPLY: "place_of_supply", DISTRICT: "district",
  ADDRESS: "address", PO_BOX: "po_box", EMAIL: "email", PHONE: "phone",
  MOBILE: "mobile", TRN: "trn", PRIORITY: "priority",
  LATITUDE: "latitude", LONGITUDE: "longitude",
  MAPS_LINK_COORDS: "maps_link_coords",
  LOCATION_SOURCE: "location_source", LOCATION_STATUS: "location_status",
  REQUIRED_INFO: "required_info", NOTES: "notes",
};

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text).trim();
  }
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    return String((v as { result: unknown }).result ?? "").trim();
  }
  return String(v).trim();
};

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const ws = wb.getWorksheet("Customer Master");
  if (!ws) throw new Error(`${SRC} has no "Customer Master" sheet`);
  const headers = ws.getRow(1).values as unknown[];
  const src = headers.slice(1).map((h) => cell(h));
  const unmapped = src.filter((h) => h && !HEADER_MAP[h]);
  if (unmapped.length) throw new Error(`Unmapped master-file columns: ${unmapped.join(", ")}`);
  const out = src.map((h) => HEADER_MAP[h]);

  const rows: string[][] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values as unknown[];
    const cells = src.map((_, i) => cell(vals[i + 1]));
    if (cells.every((c) => c === "")) continue;
    rows.push(cells);
  }

  await writeFile(OUT, [out.join(","), ...rows.map((c) => c.map(esc).join(","))].join("\n") + "\n", "utf8");

  // The Groups sheet is a cross-check, not a second import: CUSTOMER_GROUP on each
  // customer row is the authority. Report any group member the master file lacks.
  const gs = wb.getWorksheet("Customer Groups");
  const accounts = new Set(rows.map((c) => c[out.indexOf("account_no")]));
  const groupCol = out.indexOf("customer_group");
  const inline = new Map<string, number>();
  for (const c of rows) { const g = c[groupCol]; if (g) inline.set(g, (inline.get(g) ?? 0) + 1); }

  const problems: string[] = [];
  let sheetGroups = 0, sheetMembers = 0;
  if (gs) {
    for (let r = 2; r <= gs.rowCount; r++) {
      const v = gs.getRow(r).values as unknown[];
      const name = cell(v[1]); if (!name) continue;
      sheetGroups++;
      const members = cell(v[2]).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      sheetMembers += members.length;
      const missing = members.filter((m) => !accounts.has(m));
      if (missing.length) problems.push(`  ${name}: account(s) not in Customer Master — ${missing.join(", ")}`);
      const onRows = inline.get(name) ?? 0;
      if (onRows !== members.length) {
        problems.push(`  ${name}: Groups sheet lists ${members.length} member(s), ${onRows} customer row(s) carry CUSTOMER_GROUP="${name}"`);
      }
    }
  }

  console.log(`wrote ${OUT}: ${rows.length} rows × ${out.length} columns`);
  console.log(`columns: ${out.join(", ")}`);
  console.log(`groups: ${sheetGroups} on the Groups sheet (${sheetMembers} members), ${inline.size} distinct on customer rows`);
  console.log(problems.length ? `group cross-check problems:\n${problems.join("\n")}` : "group cross-check: consistent");
})();
