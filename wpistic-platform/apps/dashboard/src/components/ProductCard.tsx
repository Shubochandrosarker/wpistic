import { ExternalLink, KeyRound, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, statusBadgeVariant } from './ui';
import { titleCase } from '../lib/format';

export interface OwnedProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  app_url: string | null;
  marketing_url: string | null;
  type: string;
  plan: string | null;
  sub_status?: string;
  source?: 'subscription' | 'license' | null;
}

export function ProductCard({ product }: { product: OwnedProduct }) {
  const status = product.sub_status ?? 'active';
  return (
    <Card className="p-5 flex flex-col gap-4" hover>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-lg bg-surface-hover border border-border grid place-items-center font-bold text-accent shrink-0">
            {product.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{product.name}</h3>
            <p className="text-[13px] text-muted truncate">
              {product.plan ? `${titleCase(product.plan)} plan` : titleCase(product.type)}
            </p>
          </div>
        </div>
        <Badge variant={statusBadgeVariant(status)}>{titleCase(status)}</Badge>
      </div>
      {product.description && <p className="text-[13px] text-muted line-clamp-2">{product.description}</p>}
      <div className="flex items-center gap-2 mt-auto">
        {product.app_url ? (
          <a href={product.app_url} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" className="w-full">
              Open App <ExternalLink size={13} />
            </Button>
          </a>
        ) : (
          <Link to="/licenses" className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              <KeyRound size={13} /> View Licenses
            </Button>
          </Link>
        )}
        <Link to="/billing">
          <Button size="sm" variant="ghost">
            Manage Plan <ArrowUpRight size={13} />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
