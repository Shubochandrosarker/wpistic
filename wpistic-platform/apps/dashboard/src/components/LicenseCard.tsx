import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { LicenseView } from '@wpistic/types';
import { Badge, Card, statusBadgeVariant } from './ui';
import { formatDate, titleCase } from '../lib/format';

export function LicenseCard({ license, onClick }: { license: LicenseView; onClick?: () => void }) {
  const [copied, setCopied] = useState(false);
  const usagePct =
    license.max_activations > 0 ? Math.min(100, (license.active_activations / license.max_activations) * 100) : 0;

  return (
    <Card className="p-5 cursor-pointer" hover>
      <div onClick={onClick}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold">{license.product_name}</h3>
            <p className="text-[13px] text-muted">{titleCase(license.plan)} plan</p>
          </div>
          <Badge variant={statusBadgeVariant(license.status)}>{titleCase(license.status)}</Badge>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <code className="text-[13px] font-mono text-[#A1A1A1] bg-background border border-border rounded-md px-2.5 py-1.5 truncate flex-1">
            {license.key_mask}
          </code>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(license.key_mask).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="p-2 rounded-md text-muted hover:text-white hover:bg-surface-hover transition-colors"
            title="Copy masked key"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[12px] text-muted">
            <span>
              Activations {license.active_activations}/{license.max_activations}
            </span>
            <span>{license.expires_at ? `Expires ${formatDate(license.expires_at)}` : 'Never expires'}</span>
          </div>
          <div className="h-1.5 rounded-full bg-background overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${usagePct >= 100 ? 'bg-warning' : 'bg-accent'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
