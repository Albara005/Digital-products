import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 p-8 text-center">
      <p className="font-display text-4xl font-bold text-volt">404</p>
      <h2 className="text-lg font-bold">العنصر غير موجود</h2>
      <p className="text-sm text-muted">ربما تم حذفه أو أن الرابط غير صحيح.</p>
      <Link href="/admin" className="btn-ghost mt-2">
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}
