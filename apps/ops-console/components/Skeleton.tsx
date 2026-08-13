// Loading skeletons (speed refresh item 1): navigation paints instantly with a
// structured placeholder instead of a blank screen while server data streams in.
export function PageSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      {title && (
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-neutral-200" />
          <div className="h-4 w-96 max-w-full rounded bg-neutral-100" />
        </div>
      )}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-1/4 rounded bg-neutral-200" />
              <div className="h-4 w-1/6 rounded bg-neutral-100" />
              <div className="h-4 w-1/5 rounded bg-neutral-100" />
              <div className="ml-auto h-4 w-16 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function TilesSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 rounded bg-neutral-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-neutral-100" />
            <div className="mt-3 h-7 w-16 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
