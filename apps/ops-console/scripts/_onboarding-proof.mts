import pg from "pg";
const url = new URL(process.env.DATABASE_URL!); url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const line = (s = "") => console.log(s);
const head = (s: string) => { line(); line("── " + s + " " + "─".repeat(Math.max(0, 58 - s.length))); };

// A brand-new person nobody has ever heard of.
const AUTH_ID = "00000000-0000-4000-8000-0000000000f1";
const EMAIL = "new.technician.proof@gmail.com";
await q(`delete from app_user_identities where provider_user_id = $1`, [AUTH_ID]);
await q(`delete from user_roles where user_id = $1`, [AUTH_ID]);
await q(`delete from app_users where id = $1`, [AUTH_ID]);

head("1. FIRST SIGN-IN — Google, address nobody registered");
const first = (await q(`select fn_link_identity($1,$2,$3,'google') as id`, [AUTH_ID, EMAIL, "Rashid K"]))[0];
const rec = (await q(`select full_name, email, status, technician_id from app_users where id=$1`, [AUTH_ID]))[0];
line(`  session granted : ${first.id === null ? "NO — returns null" : "YES  <-- WRONG"}`);
line(`  recorded as     : ${rec.status}  (${rec.full_name}, ${rec.email})`);
line(`  roles held      : ${(await q(`select count(*)::int n from user_roles where user_id=$1`, [AUTH_ID]))[0].n}`);
line(`  -> authenticated, visible to the office, reaches nothing.`);

head("2. SIGNING IN AGAIN CHANGES NOTHING");
const again = (await q(`select fn_link_identity($1,$2,$3,'google') as id`, [AUTH_ID, EMAIL, "Rashid K"]))[0];
line(`  session granted : ${again.id === null ? "NO — still pending" : "YES  <-- WRONG"}`);
line(`  duplicate rows  : ${(await q(`select count(*)::int n from app_users where email=$1`, [EMAIL]))[0].n} (must be 1)`);

head("3. THE PENDING QUEUE THE ADMIN SEES");
console.table(await q(
  `select full_name, email, status, last_sign_in_at is not null as seen
     from app_users where status='pending' order by created_at desc limit 5`));

head("4. ADMIN APPROVES — matched to a staff record, given a role");
const T = (await q(`select tenant_id from app_users where id=$1`, [AUTH_ID]))[0].tenant_id;
const tech = (await q(`select id, coalesce(full_name,code) nm from technicians where tenant_id=$1 limit 1`, [T]))[0];
const role = (await q(`select id, code from roles where tenant_id=$1 and code='technician'`, [T]))[0];
await q(`update app_users set status='active', technician_id=$2, approved_at=now() where id=$1`, [AUTH_ID, tech?.id ?? null]);
await q(`insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3)
         on conflict do nothing`, [T, AUTH_ID, role.id]);
const after = (await q(`select status, is_active, technician_id from app_users where id=$1`, [AUTH_ID]))[0];
line(`  status ......... ${after.status}`);
line(`  is_active ...... ${after.is_active}   <- derived by trigger, status is the source of truth`);
line(`  staff record ... ${tech?.nm ?? "(none)"}`);
line(`  role ........... ${role.code}`);

head("5. NOW SIGN-IN WORKS — one tap, forever after");
const ok = (await q(`select fn_link_identity($1,$2,$3,'google') as id`, [AUTH_ID, EMAIL, "Rashid K"]))[0];
line(`  session granted : ${ok.id === AUTH_ID ? "YES" : "NO  <-- WRONG"}`);
line(`  last_sign_in_at : ${(await q(`select last_sign_in_at is not null s from app_users where id=$1`,[AUTH_ID]))[0].s ? "stamped" : "NOT STAMPED"}`);

head("6. DEACTIVATE — access ends immediately");
await q(`update app_users set status='deactivated' where id=$1`, [AUTH_ID]);
const dead = (await q(`select fn_link_identity($1,$2,$3,'google') as id`, [AUTH_ID, EMAIL, "Rashid K"]))[0];
const flags = (await q(`select status, is_active from app_users where id=$1`, [AUTH_ID]))[0];
line(`  session granted : ${dead.id === null ? "NO" : "YES  <-- WRONG"}`);
line(`  status/is_active: ${flags.status} / ${flags.is_active}`);

head("7. A PASSWORD USER CREATED IN THE SUPABASE DASHBOARD");
const PW_ID = "00000000-0000-4000-8000-0000000000f2";
await q(`delete from app_user_identities where provider_user_id=$1`, [PW_ID]);
await q(`delete from app_users where id=$1`, [PW_ID]);
const pw = (await q(`select fn_link_identity($1,$2,$3,'password') as id`, [PW_ID, "operations.proof@almumtaz.ae", "Ops Proof"]))[0];
const pwrec = (await q(`select status from app_users where id=$1`, [PW_ID]))[0];
line(`  session granted : ${pw.id === null ? "NO — pending" : "YES  <-- WRONG"}`);
line(`  recorded as     : ${pwrec?.status ?? "NOT RECORDED  <-- WRONG"}`);
line(`  -> this is what makes the dashboard fallback work without the service key:`);
line(`     create the user there, they sign in once, they appear in the queue.`);

head("CLEANUP");
await q(`delete from user_roles where user_id = any($1::uuid[])`, [[AUTH_ID, PW_ID]]);
await q(`delete from app_user_identities where provider_user_id = any($1::uuid[])`, [[AUTH_ID, PW_ID]]);
await q(`delete from app_users where id = any($1::uuid[])`, [[AUTH_ID, PW_ID]]);
line(`  proof users removed.`);
await pool.end();
