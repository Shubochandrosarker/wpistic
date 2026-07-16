export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-4xl font-extrabold tracking-tight text-ink-900 tabular-nums sm:text-5xl">
        {value}
      </div>
      <div className="mt-1.5 text-sm text-ink-500">{label}</div>
    </div>
  );
}
