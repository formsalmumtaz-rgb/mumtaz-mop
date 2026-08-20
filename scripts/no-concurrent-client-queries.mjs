#!/usr/bin/env node
// Fails the build when two or more queries are issued on the SAME PoolClient
// inside one Promise.all / Promise.race / Promise.allSettled.
//
// Why this is worth a gate rather than a code review note: a pg client executes
// one query at a time, so Promise.all over a single client buys nothing — it
// just grows the client's queue, which pg 8 deprecates and pg 9 removes. And if
// that client is inside a transaction (everything through withRequest is), it
// is statements interleaving within one BEGIN, which is a correctness problem
// rather than a style one. It reads as parallel and is not, which is exactly the
// kind of thing that survives review.
//
// Found services/worker/src/reports.ts (5 queries, one client) after the
// DeprecationWarning appeared in production logs.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `git ls-files '*.ts' '*.tsx' '*.mts' '*.mjs' | grep -vE 'node_modules|\\.next'`,
  { encoding: "utf8" }).trim().split("\n").filter(Boolean);

// Receivers that are a database client rather than something else with .query().
const CLIENT_NAMES = /^(c|client|tx|conn|db|pool|poolClient)$/;

function matchingBlock(src, openIdx) {
  const open = src[openIdx], close = open === "(" ? ")" : "]";
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}

const offences = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/Promise\.(all|allSettled|race)\s*\(/g)) {
    const block = matchingBlock(src, m.index + m[0].length - 1);
    const counts = {};
    for (const q of block.matchAll(/(^|[^.\w])([A-Za-z_$][\w$]*)\.query\s*\(/g)) {
      if (CLIENT_NAMES.test(q[2])) counts[q[2]] = (counts[q[2]] ?? 0) + 1;
    }
    for (const [recv, n] of Object.entries(counts)) {
      if (n >= 2) {
        offences.push({ file, line: src.slice(0, m.index).split("\n").length, recv, n, call: m[0] });
      }
    }
  }
}

if (offences.length === 0) {
  console.log("✓ Client-concurrency gate OK — no shared-client queries inside a Promise combinator.");
  process.exit(0);
}
for (const o of offences) {
  console.error(
    `\n${o.file}:${o.line}\n` +
    `  ${o.n} \`${o.recv}.query()\` calls inside ${o.call.trim()} on ONE client.\n` +
    `  A pg client runs one query at a time — this is a queue, not parallelism, and\n` +
    `  pg 9 removes it. Await them in sequence, or give each its own client if the\n` +
    `  parallelism is genuinely worth the connections.`);
}
console.error(`\n✗ ${offences.length} site(s). Failing the build.`);
process.exit(1);
