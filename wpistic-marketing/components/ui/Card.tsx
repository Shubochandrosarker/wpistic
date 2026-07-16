import type { ReactNode, HTMLAttributes } from "react";

export function Card({
  children,
  className = "",
  dark = false,
  hoverable = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  hoverable?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[20px] border p-6 transition-all duration-200 ${
        dark
          ? "bg-ink-900 border-ink-800 text-white"
          : "bg-white border-ink-150 shadow-[var(--shadow-sm)]"
      } ${hoverable ? "hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
