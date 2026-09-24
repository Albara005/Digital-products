import { getDictionary } from "@/i18n/server";

export default async function StoreLoading() {
  const t = await getDictionary();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6" aria-busy="true" aria-label={t.common.loading}>
      <div className="h-3 w-24 animate-pulse rounded bg-volt/20" />
      <div className="mt-4 h-9 w-64 max-w-full animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-surface-2" />
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="card overflow-hidden">
            <div className="aspect-[4/3] animate-pulse bg-surface-2" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-16 animate-pulse rounded-full bg-surface-2" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
              <div className="h-5 w-20 animate-pulse rounded bg-surface-2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
