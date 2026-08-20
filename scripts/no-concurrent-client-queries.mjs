#!/usr/bin/env node
// Fails the build on two shapes that both put a second query on a pg client
// that is already busy — the thing pg 8 deprecates and pg 9 removes.
//
// SHAPE 1 — two or more queries on the SAME client inside a Promise combinator.
// A pg client executes one query at a time, so Promise.all over one client buys
// nothing; it just grows that client's queue. And if the client is inside a
// transaction (everything through withRequest is), it is statements interleaving
// within one BEGIN — a correctness problem, not a style one. It reads as
// parallel and is not, which is exactly what survives review.
// Found services/worker/src/reports.ts (5 queries, one client).
//
// SHAPE 2 — an unawaited query inside a pool `connect` handler. This one looks
// harmless: the client has not been handed to anyone yet. On an idle pool that
// is true, and I checked it that way and wrote it up as safe (DEBT.md D-KEEP1).
// Under pressure pg-pool hands the client to a WAITING caller in the same tick,
// and their query lands on top of the unawaited one. It bit within a day. The
// gate now disagrees with the entry, which is the point of having a gate.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `git ls-files '*.ts' '*.tsx' '*.mts' '*.mjs' | grep -vE 'node_modules|\\.next'`,
  { encoding: "utf8" }).trim().split("\n").filter(Boolean);

// Receivers that are a database client rather than something else with .query().
const CLIENT_NAMES = /^(c|client|tx|conn|db|pool|poolClient|p)$/;

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

  // SHAPE 1
  for (const m of src.matchAll(/Promise\.(all|allSettled|race)\s*\(/g)) {
    const block = matchingBlock(src, m.index + m[0].length - 1);
    const counts = {};
    for (const q of block.matchAll(/(^|[^.\w])([A-Za-z_$][\w$]*)\.query\s*\(/g)) {
      if (CLIENT_NAMES.test(q[2])) counts[q[2]] = (counts[q[2]] ?? 0) + 1;
    }
    for (const [recv, n] of Object.entries(counts)) {
      if (n >= 2) offences.push({ kind: "combinator", file, recv, n,
        line: src.slice(0, m.index).split("\n").length, call: m[0].trim() });
    }
  }

  // SHAPE 2
  for (const m of src.matchAll(/\.on\s*\(\s*["']connect["']\s*,/g)) {
    const argStart = src.indexOf("(", m.index);
    const block = matchingBlock(src, argStart);
    for (const q of block.matchAll(/(^|[^.\w])([A-Za-z_$][\w$]*)\.query\s*\(/g)) {
      if (!CLIENT_NAMES.test(q[2])) continue;
      const upto = block.slice(0, q.index + q[0].length).replace(/\.query\s*\($/, "");
      if (/\bawait\s+[\w.]*$/.test(upto) || /\breturn\s+[\w.]*$/.test(upto)) continue;
      offences.push({ kind: "connect", file, recv: q[2], n: 1,
        line: src.slice(0, m.index).split("\n").length });
    }
  }
}

if (offences.length === 0) {
  console.log("✓ Client-concurrency gate OK — no query lands on a busy pg client.");
  process.exit(0);
}
for (const o of offences) {
  console.error(`\n${o.file}:${o.line}`);
  if (o.kind === "combinator") {
    console.error(
      `  ${o.n} \`${o.recv}.query()\` calls inside ${o.call} on ONE client.\n` +
      `  A pg client runs one query at a time — this is a queue, not parallelism,\n` +
      `  and pg 9 removes it. Await them in sequence, or give each its own client\n` +
      `  if the parallelism is genuinely worth the connections.`);
  } else {
    console.error(
      `  an unawaited \`${o.recv}.query()\` inside a pool connect handler.\n` +
      `  Looks safe — the client is not handed over yet — and on an idle pool it is.\n` +
      `  Under pressure pg-pool hands that client to a WAITING caller in the same\n` +
      `  tick and their query lands on top of this one. Bind it where the client is\n` +
      `  acquired instead: see withRequest's preamble, or bindEnvironment().`);
  }
}
console.error(`\n✗ ${offences.length} site(s). Failing the build.`);
process.exit(1);
