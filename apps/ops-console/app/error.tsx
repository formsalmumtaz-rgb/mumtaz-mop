"use client";
// Global error boundary (refresh item 7): a crash renders a contained retry
// card, never a white page.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-red-800">Something went wrong</h2>
      <p className="mt-2 text-sm text-red-700">{error.digest ? `Reference: ${error.digest}` : error.message}</p>
      <button onClick={reset} className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">Try again</button>
    </div>
  );
}
