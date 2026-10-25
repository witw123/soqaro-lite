"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Compass, ListMusic, User } from "lucide-react";

type MobileNavIconName = "home" | "discover" | "playlist" | "profile";

type MobileNavItem = {
  id: "home" | "discover" | "playlists" | "profile";
  label: string;
  href: Route;
  icon: MobileNavIconName;
};

const items: MobileNavItem[] = [
  { id: "home", label: "首页", href: "/app", icon: "home" },
  { id: "discover", label: "发现", href: "/app/discover" as Route, icon: "discover" },
  { id: "playlists", label: "歌单", href: "/app/playlists", icon: "playlist" },
  { id: "profile", label: "我的", href: "/app/profile", icon: "profile" }
];

export function MobileAppNavigation({ onNavigateAway }: { onNavigateAway?: () => void }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<Route | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="mobile-app-navigation fixed inset-x-0 bottom-0 z-[70] isolate h-[calc(3.25rem+env(safe-area-inset-bottom))] md:hidden" data-custom-layout-item="mobile-navigation" aria-label="主导航">
      <div className="grid h-full grid-cols-4 items-stretch px-1 pb-[env(safe-area-inset-bottom)] pt-0.5">
        {items.map((item) => {
          const active = pendingHref === item.href || isActivePath(pathname, item.href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`mobile-app-navigation__item ${active ? "mobile-app-navigation__item--active" : ""}`}
              href={item.href}
              key={item.id}
              onClick={onNavigateAway}
              onPointerDown={() => setPendingHref(item.href)}
            >
              <MobileNavIcon name={item.icon} />
              <span className="mobile-app-navigation__label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileNavIcon({ name }: { name: MobileNavIconName }) {
  const className = "mobile-app-navigation__icon h-5 w-5";

  if (name === "home") return <Home className={className} />;
  if (name === "discover") return <Compass className={className} />;
  if (name === "playlist") return <ListMusic className={className} />;
  if (name === "profile") return <User className={className} />;
  return null;
}

function isActivePath(pathname: string | null, href: Route) {
  if (href === "/app") {
    return pathname === "/" || pathname === "/app" || pathname === "/rooms" || (pathname?.startsWith("/room") ?? false);
  }
  return pathname?.startsWith(href) ?? false;
}


