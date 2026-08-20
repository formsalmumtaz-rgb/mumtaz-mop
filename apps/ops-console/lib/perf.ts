import "server-only";

// Server-side step timing, off unless MOP_PERF=1.
//
// Added because "every transition was slow" could not be acted on: the page
// timings said /surveys/[id] took 855ms and /contracts/[id] took 223ms, and
// nothing said which of the eight awaits on the slow one was responsible.
// Guessing at that is how you optimise the wrong thing.
//
// Emits one line per page render with each step's duration, so the answer is
// read rather than reasoned about:
//   [perf] surveys/[id] 842ms = tenant 61 · division 148 · baseLocation 402 · data 231
const ON = process.env.MOP_PERF === "1";

export function perf(label: string) {
  if (!ON) return { step: async <T>(_n: string, p: Promise<T> | (() => Promise<T>)) =>
    (typeof p === "function" ? p() : p), done: () => {} };
  const t0 = Date.now();
  const steps: string[] = [];
  return {
    async step<T>(name: string, p: Promise<T> | (() => Promise<T>)): Promise<T> {
      const t = Date.now();
      const v = await (typeof p === "function" ? p() : p);
      steps.push(`${name} ${Date.now() - t}`);
      return v;
    },
    done() {
      console.log(`[perf] ${label} ${Date.now() - t0}ms = ${steps.join(" · ")}`);
    },
  };
}
