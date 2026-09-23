export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">جارٍ التحميل…</span>
      <div className="mb-6 h-8 w-48 rounded-lg bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
      <div className="card mt-6 h-72" />
    </div>
  );
}
