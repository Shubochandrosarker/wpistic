import Link from "next/link";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { ProductGlyph } from "./ProductGlyph";
import { Icon } from "./Icon";
import type { Product } from "@/lib/products";

const STATUS_TONE = { Live: "green", Beta: "purple", "Coming Soon": "gray" } as const;

export function ProductCard({ product }: { product: Product }) {
  return (
    <Card hoverable className="flex flex-col">
      <div className="flex items-start gap-3.5">
        <ProductGlyph category={product.category} icon={product.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15.5px] font-bold text-ink-900">{product.name}</span>
            {product.flagship && <Badge tone="purple">Flagship</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-ink-400">{product.category}</div>
        </div>
        <Badge tone={STATUS_TONE[product.status]} dot>
          {product.status}
        </Badge>
      </div>
      <p className="mt-3.5 flex-1 text-[13.5px] leading-relaxed text-ink-600">{product.tagline}</p>
      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
        <span className="text-sm font-semibold text-ink-900">
          {product.startingPrice != null ? `From $${product.startingPrice}/mo` : "Coming soon"}
        </span>
        <Link
          href={`/products/${product.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-purple-600 hover:text-purple-700"
        >
          Learn more <Icon name="arrow" size={14} />
        </Link>
      </div>
    </Card>
  );
}
