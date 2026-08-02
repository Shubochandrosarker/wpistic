/**
 * Interactive data table island: client-side text search, column sort, and
 * optional row actions posted through the same-origin admin proxy.
 */
import { useMemo, useState } from 'react';

export interface Column {
  key: string;
  label: string;
  mono?: boolean;
  badge?: boolean;
}

export interface RowAction {
  label: string;
  /** e.g. "/licenses/{id}/action" — {id} replaced by row.id */
  endpoint: string;
  body?: Record<string, unknown>;
  confirm?: string;
  /** ask for a reason and merge into body.reason */
  requireReason?: boolean;
  danger?: boolean;
}

const BADGE_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-300 border-green-500/30',
  lifetime: 'bg-green-500/10 text-green-300 border-green-500/30',
  paid: 'bg-green-500/10 text-green-300 border-green-500/30',
  trialing: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  past_due: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  open: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  suspended: 'bg-red-500/10 text-red-300 border-red-500/30',
  revoked: 'bg-red-500/10 text-red-300 border-red-500/30',
  expired: 'bg-red-500/10 text-red-300 border-red-500/30',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/30',
};

export default function DataTable({
  columns,
  rows,
  actions = [],
  searchable = true,
}: {
  columns: Column[];
  rows: Array<Record<string, unknown>>;
  actions?: RowAction[];
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let out = q
      ? rows.filter((row) => columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q)))
      : [...rows];
    if (sortKey) {
      out.sort((a, b) => {
        const av = String(a[sortKey] ?? '');
        const bv = String(b[sortKey] ?? '');
        return av.localeCompare(bv, undefined, { numeric: true }) * sortDir;
      });
    }
    return out;
  }, [rows, columns, query, sortKey, sortDir]);

  const runAction = async (action: RowAction, row: Record<string, unknown>) => {
    const id = String(row.id ?? '');
    if (action.confirm && !window.confirm(action.confirm)) return;
    let reason: string | undefined;
    if (action.requireReason) {
      reason = window.prompt('Reason (recorded in the audit log):') ?? undefined;
      if (!reason || reason.trim().length < 3) return;
    }
    setBusy(`${action.label}:${id}`);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: action.endpoint.replace('{id}', id),
          body: { ...(action.body ?? {}), ...(reason ? { reason } : {}) },
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? 'Action failed');
      setMessage(`${action.label} — done. Reload to see fresh data.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card">
      {searchable && (
        <div className="p-3 border-b border-border flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-64 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <span className="text-[12px] text-muted">
            {filtered.length} of {rows.length}
          </span>
          {message && <span className="text-[12px] text-accent ml-auto">{message}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => {
                    if (sortKey === col.key) setSortDir((d) => (d === 1 ? -1 : 1));
                    else {
                      setSortKey(col.key);
                      setSortDir(1);
                    }
                  }}
                  className="text-left font-medium text-[13px] text-muted px-4 py-2.5 whitespace-nowrap cursor-pointer select-none hover:text-white"
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              {actions.length > 0 && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + (actions.length ? 1 : 0)} className="px-4 py-8 text-center text-muted">
                  No results
                </td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr key={String(row.id ?? i)} className="hover:bg-surface-hover/50 transition-colors">
                {columns.map((col) => {
                  const value = row[col.key];
                  const text = value === null || value === undefined ? '—' : String(value);
                  return (
                    <td key={col.key} className="px-4 py-2.5 align-middle whitespace-nowrap">
                      {col.badge ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-[12px] font-medium ${
                            BADGE_STYLES[text] ?? 'bg-surface-hover text-[#A1A1A1] border-border'
                          }`}
                        >
                          {text.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className={col.mono ? 'font-mono text-[12px] text-[#A1A1A1]' : 'text-[13px]'}>{text}</span>
                      )}
                    </td>
                  );
                })}
                {actions.length > 0 && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {actions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => void runAction(action, row)}
                        disabled={busy !== null}
                        className={`text-[12px] px-2 py-1 rounded-md ml-1 transition-colors disabled:opacity-50 ${
                          action.danger
                            ? 'text-red-300 hover:bg-red-500/10'
                            : 'text-[#A1A1A1] hover:text-white hover:bg-surface-hover'
                        }`}
                      >
                        {busy === `${action.label}:${String(row.id)}` ? '…' : action.label}
                      </button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
