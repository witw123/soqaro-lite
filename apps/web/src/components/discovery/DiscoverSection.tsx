import React from "react";

export function DiscoverSection({
  title,
  subtitle,
  icon,
  children
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 sm:mt-7">
      <div className="mb-2 sm:mb-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {subtitle ? <p className="mt-0.5 text-xs text-foreground-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
