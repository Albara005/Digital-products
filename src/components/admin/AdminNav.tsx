"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  BoxIcon,
  CloseIcon,
  FolderIcon,
  HomeIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  ReceiptIcon,
  ShieldIcon,
  StarIcon,
  HistoryIcon,
  TagIcon,
  UsersIcon,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number;
  exact?: boolean;
};

type Props = {
  admin: { name: string; email: string; role: "SUPER_ADMIN" | "STAFF" };
  awaitingDelivery: number;
  logoutAction: () => Promise<void>;
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminNav({ admin, awaitingDelivery, logoutAction }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items: NavItem[] = [
    { href: "/admin", label: "الرئيسية", icon: HomeIcon, exact: true },
    { href: "/admin/orders", label: "الطلبات", icon: ReceiptIcon, badge: awaitingDelivery },
    { href: "/admin/products", label: "المنتجات", icon: BoxIcon },
    { href: "/admin/categories", label: "الفئات", icon: FolderIcon },
    { href: "/admin/inventory", label: "المخزون", icon: LayersIcon },
    { href: "/admin/customers", label: "العملاء", icon: UsersIcon },
    { href: "/admin/tickets", label: "تذاكر الدعم", icon: ReceiptIcon },
    { href: "/admin/coupons", label: "الكوبونات", icon: TagIcon },
    { href: "/admin/reviews", label: "التقييمات", icon: StarIcon },
    ...(admin.role === "SUPER_ADMIN"
      ? [
          { href: "/admin/reports", label: "التقارير", icon: HomeIcon },
          { href: "/admin/settings", label: "الإعدادات", icon: ShieldIcon },
          { href: "/admin/team", label: "الفريق", icon: UsersIcon },
          { href: "/admin/audit", label: "سجل النشاط", icon: HistoryIcon },
        ]
      : []),
    { href: "/admin/account", label: "حسابي والأمان", icon: ShieldIcon },
  ];

  const links = (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-volt/10 text-volt" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {active && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-volt" aria-hidden="true" />}
              <Icon className="size-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  className="rounded-full bg-volt px-2 py-0.5 font-display text-[11px] font-bold text-bg"
                  title="طلبات بانتظار التسليم"
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const account = (
    <div className="border-t border-border pt-4">
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-volt ring-1 ring-border">
          {admin.name.trim().charAt(0) || "؟"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{admin.name}</p>
          <p className="truncate text-xs text-muted" dir="ltr">
            {admin.email}
          </p>
        </div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <LogoutIcon className="size-[18px] rtl:-scale-x-100" />
          تسجيل خروج
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/admin" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
      <Image
        src="/brand/nitro-logo.webp"
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-lg ring-1 ring-border"
        priority
      />
      <span className="leading-tight">
        <span className="block font-display text-sm font-bold tracking-wide">NITRO STORE</span>
        <span className="block text-[11px] text-muted">لوحة التحكم</span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-e border-border bg-surface px-4 py-5 lg:flex">
        {brand}
        <nav aria-label="القائمة الرئيسية" className="flex-1 overflow-y-auto">
          {links}
        </nav>
        {account}
      </aside>

      {/* Mobile top bar + drawer. The dimmer lives outside the bar: backdrop-blur would make the
          bar the containing block of a fixed child. */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <div className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          {brand}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg border border-border text-text"
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
        {open && (
          <div
            id="admin-mobile-nav"
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-65px)] overflow-y-auto border-b border-border bg-surface px-4 pb-4 pt-3 shadow-2xl"
          >
            <nav aria-label="القائمة الرئيسية" className="mb-4">
              {links}
            </nav>
            {account}
          </div>
        )}
      </div>
    </>
  );
}
