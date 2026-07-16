export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-purple-600 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {children}
    </div>
  );
}
