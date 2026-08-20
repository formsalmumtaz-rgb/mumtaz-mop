// Load ../../.env.local into process.env IF IT EXISTS.
//
// The build gates used `node --env-file=../../.env.local`. That flag is not
// optional: Node exits 9 with "not found" when the file is absent. .env.local is
// git-ignored, so it is absent on exactly one machine that matters — the build
// container — and `prebuild` therefore killed every deploy before `next build`
// ever ran. A gate that cannot run outside a developer's laptop is not a gate.
//
// Anything already in process.env wins, which is what a hosting platform sets.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, "../../../.env.local");

export function loadEnvLocal() {
  if (!existsSync(file)) return false;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;               // the platform's value wins
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
  return true;
}

loadEnvLocal();
