import type { ReactNode } from "react";

type Tone = "purple" | "green" | "amber" | "gray" | "red";

const toneClasses: Record<Tone, string> = {
  purple: "bg-purple-100 text-purple-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-ink-100 text-ink-600",
  red: "bg-red-100 text-red-700",
};

export function Badge({
  children,
  tone = "purple",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${toneClasses[tone]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
