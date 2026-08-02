import { useState, useRef, useEffect } from 'react';
import { ExternalLink, LayoutGrid } from 'lucide-react';
import { useOrgProducts } from '../hooks/useApi';

/** Quick-open dropdown for the product apps this organization is authorized to use. */
export function ProductSwitcher() {
  const { data } = useOrgProducts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const apps = (data?.products ?? []).filter((p) => p.app_url);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-muted hover:text-white hover:bg-surface transition-colors"
        title="Open product app"
        aria-label="Open product app"
      >
        <LayoutGrid size={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-60 rounded-lg border border-border bg-surface shadow-card py-1 animate-fade-in">
          {apps.length === 0 && <p className="px-3 py-2.5 text-sm text-muted">No product apps yet</p>}
          {apps.map((p) => (
            <a
              key={p.id}
              href={p.app_url!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-hover transition-colors"
            >
              <span className="w-6 h-6 rounded-md bg-surface-hover border border-border grid place-items-center text-[11px] font-bold">
                {p.name.charAt(0)}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              <ExternalLink size={13} className="text-muted" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
