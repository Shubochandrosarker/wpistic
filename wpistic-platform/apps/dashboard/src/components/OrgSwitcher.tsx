import { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useCurrentOrg, useSwitchOrg } from '../hooks/useAuth';
import { api } from '../lib/api-client';
import { Button, Input, Modal } from './ui';
import { useQueryClient } from '@tanstack/react-query';

export function OrgSwitcher() {
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrg = useCurrentOrg();
  const switchOrg = useSwitchOrg();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const createOrg = async () => {
    if (newName.trim().length < 2) return;
    setBusy(true);
    try {
      const { organization } = await api.createOrganization({ name: newName.trim() });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await switchOrg(organization.id);
      setCreateOpen(false);
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors"
      >
        <span className="w-6 h-6 rounded-md bg-accent text-background grid place-items-center text-[12px] font-bold shrink-0">
          {currentOrg?.name.charAt(0).toUpperCase() ?? '·'}
        </span>
        <span className="text-sm font-medium truncate flex-1 text-left">{currentOrg?.name ?? 'Select organization'}</span>
        <ChevronsUpDown size={14} className="text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full rounded-lg border border-border bg-surface shadow-card py-1 animate-fade-in">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={async () => {
                setOpen(false);
                if (org.id !== currentOrg?.id) await switchOrg(org.id);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-surface-hover transition-colors"
            >
              <span className="truncate flex-1 text-left">{org.name}</span>
              {org.id === currentOrg?.id && <Check size={14} className="text-accent" />}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-white hover:bg-surface-hover transition-colors"
            >
              <Plus size={14} /> New organization
            </button>
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createOrg} disabled={busy || newName.trim().length < 2}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          Organizations own products, licenses, and billing. Use them to separate clients or teams.
        </p>
        <Input placeholder="Acme Agency" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
      </Modal>
    </div>
  );
}
