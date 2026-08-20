import Module from "node:module";
import { fileURLToPath } from "node:url";
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const rf = (Module as never as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as never as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, r: string, ...a: unknown[]) {
  if (r === "server-only" || r === "client-only") return NOOP;
  return rf.call(this, r, ...a);
};
process.env.MOP_ENV = "development"; process.env.AUTH_REQUIRED = "false";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const T = "5b557699-b1d1-417e-b42d-fdd3be366354";
const line = (s = "") => console.log(s);
const head = (s: string) => { line(); line("── " + s + " " + "─".repeat(Math.max(0, 56 - s.length))); };

const { resolveOrCreateInlineCustomer } = await import("../lib/domain/customers.ts");
const sl = (await q(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [T]))[0].id;
const ft = (await q(`select id, name from facility_types where tenant_id=$1 and service_line_id=$2 and code='restaurant'`, [T, sl]))[0];

head("1. THE MANDATORY CONTACT IS ENFORCED SERVER-SIDE");
const bare = new FormData();
bare.set("new_customer_name", "Proof Bare Restaurant");
try { await resolveOrCreateInlineCustomer(T, sl, bare); line("  ✗ ACCEPTED without a contact — WRONG"); }
catch (e) { line(`  ✓ refused: ${(e as Error).message}`); }

head("2. A FULL INLINE CREATE, AS THE FORM SUBMITS IT");
const fd = new FormData();
fd.set("new_customer_name", "Proof Al Noor Restaurant");
fd.set("new_customer_type", "B2B");
fd.set("new_customer_emirate", "Sharjah");        // the dropdown default...
fd.set("geocoded_emirate", "Ajman");              // ...beaten by the actual pin
fd.set("new_contact_name", "Rashid Al Noor");
fd.set("new_contact_phone", "0501234567");
fd.set("new_contact_email", "rashid@alnoor.example");
fd.set("new_customer_email", "accounts@alnoor.example");
fd.set("new_customer_address", "Shop 4, Al Hamidiya");
fd.set("new_facility_type_id", ft.id);
fd.set("site_lat", "25.4052117");                 // from the pasted Maps link
fd.set("site_lng", "55.5162182");
fd.set("site_address", "18 49 St, Al Hamidiya 1, Ajman, United Arab Emirates");
const made = await resolveOrCreateInlineCustomer(T, sl, fd);
line(`  created ${made.code} — ${made.name}`);

const cust = (await q(`select code, trade_name, emirate from customers where id=$1`, [made.id]))[0];
line(`  emirate stored : ${cust.emirate}   <- the pin's emirate, not the dropdown default`);

console.table(await q(
  `select name, phone, email, is_primary from contacts where customer_id=$1 order by is_primary desc`, [made.id]));

const site = (await q(
  `select b.name, b.address, b.emirate, f.name as premises,
          round(ST_Y(b.location::geometry)::numeric, 6) as lat,
          round(ST_X(b.location::geometry)::numeric, 6) as lng
     from customer_branches b left join facility_types f on f.id = b.facility_type_id
    where b.customer_id=$1`, [made.id]))[0];
line();
line(`  SITE  ${site.name}`);
line(`    address  : ${site.address}`);
line(`    premises : ${site.premises}      <- the real taxonomy, not "commercial"`);
line(`    pin      : ${site.lat}, ${site.lng}`);
line(`    ${site.lat ? "✓ a job at this site can be navigated to on day one" : "✗ NO PIN"}`);

head("3. THE PICKER'S DATA — account number searchable");
const cs = await q(`select code, trade_name from customers where tenant_id=$1 and code is not null order by code limit 3`, [T]);
line(`  ${cs.length} sample rows, each carrying its account number:`);
for (const c of cs) line(`    ${String(c.code).padEnd(8)} ${c.trade_name}`);
line(`  total customers in the picker: ${(await q(`select count(*)::int n from customers where tenant_id=$1`, [T]))[0].n}`);

head("CLEANUP");
await q(`delete from contacts where customer_id=$1`, [made.id]);
await q(`delete from customer_branches where customer_id=$1`, [made.id]);
await q(`delete from customers where id=$1`, [made.id]);
line("  proof customer removed.");
await pool.end();
