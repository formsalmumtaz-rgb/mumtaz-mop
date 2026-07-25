// R2 connectivity check: upload -> retrieve (S3 + public URL) -> delete -> confirm gone.
//   node --env-file=.env.local --import tsx apps/ops-console/scripts/r2-check.ts
import { putObject, getObjectText, objectExists, deleteObject, publicUrl, r2Configured } from "../lib/storage/r2";

(async () => {
  if (!r2Configured()) {
    console.log("R2 not configured (missing env)");
    process.exit(1);
  }
  const key = `_healthcheck/mop-${Date.now()}.txt`;
  const body = `MOP R2 connectivity test ${new Date().toISOString()}`;
  console.log("bucket:", process.env.R2_BUCKET);

  await putObject(key, body, "text/plain");
  console.log("1. uploaded  :", key);

  const got = await getObjectText(key);
  console.log("2. retrieved (S3):", got === body ? "MATCH" : `MISMATCH (${got})`);

  const pub = publicUrl(key);
  let pubResult = "n/a";
  if (pub) {
    try {
      const r = await fetch(pub);
      const txt = await r.text();
      pubResult = `HTTP ${r.status}${r.status === 200 ? (txt === body ? " MATCH" : " body-mismatch") : ""}`;
    } catch (e) {
      pubResult = `fetch-failed: ${(e as Error).message}`;
    }
  }
  console.log("3. public URL:", pub, "->", pubResult);

  await deleteObject(key);
  const stillThere = await objectExists(key);
  console.log("4. deleted; exists after delete:", stillThere);

  const ok = got === body && !stillThere;
  console.log(ok ? "\nR2 OK — upload + retrieve + delete verified" : "\nR2 CHECK FAILED");
  process.exit(ok ? 0 : 1);
})();
