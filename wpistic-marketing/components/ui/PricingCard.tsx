import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import type { PricingTier } from "@/lib/pricing";

export function PricingCard({ tier, annual }: { tier: PricingTier; annual: boolean }) {
  const price = annual ? tier.annualPrice : tier.monthlyPrice;

  return (
    <Card
      className={`relative flex flex-col ${tier.highlighted ? "border-purple-300 ring-2 ring-purple-500" : ""}`}
    >
      {tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge tone={tier.highlighted ? "purple" : "green"}>{tier.badge}</Badge>
        </div>
      )}
      <div className="text-base font-bold text-ink-900">{tier.name}</div>
      <div className="mt-3 flex items-baseline gap-1">
        {price != null ? (
          <>
            <span className="font-display text-4xl font-extrabold text-ink-900">${price}</span>
            <span className="text-sm text-ink-500">/mo{annual ? ", billed yearly" : ""}</span>
          </>
        ) : (
          <span className="font-display text-3xl font-extrabold text-ink-900">Custom</span>
        )}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-600">{tier.description}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-ink-700">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-green-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        href={tier.href}
        variant={tier.highlighted ? "green" : "outline"}
        className="mt-6 w-full"
      >
        {tier.cta}
      </Button>
    </Card>
  );
}
