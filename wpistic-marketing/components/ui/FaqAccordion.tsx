import { Icon } from "./Icon";

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-ink-150 rounded-2xl border border-ink-150 bg-white">
      {items.map((item) => (
        <details key={item.q} className="group p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900 marker:content-none">
            {item.q}
            <Icon
              name="arrow-up-right"
              size={16}
              className="shrink-0 rotate-90 text-ink-400 transition-transform duration-200 group-open:rotate-[135deg]"
            />
          </summary>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
