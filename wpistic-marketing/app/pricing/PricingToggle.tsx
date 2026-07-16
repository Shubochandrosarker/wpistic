"use client";

import { useState } from "react";
import { PricingCard } from "@/components/ui/PricingCard";
import type { PricingTier } from "@/lib/pricing";

export function PricingToggle({ tiers }: { tiers: PricingTier[] }) {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-semibold ${!annual ? "text-ink-900" : "text-ink-400"}`}>
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Toggle annual billing"
          onClick={() => setAnnual((v) => !v)}
          className={`relative h-7 w-13 rounded-full transition-colors ${
            annual ? "bg-purple-500" : "bg-ink-200"
          }`}
        >
          <span
            className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              annual ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm font-semibold ${annual ? "text-ink-900" : "text-ink-400"}`}>
          Annual <span className="text-green-600">(2 months free)</span>
        </span>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {tiers
          .filter((t) => t.id !== "lifetime" && t.id !== "enterprise")
          .map((tier) => (
            <PricingCard key={tier.id} tier={tier} annual={annual} />
          ))}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {tiers
          .filter((t) => t.id === "lifetime" || t.id === "enterprise")
          .map((tier) => (
            <PricingCard key={tier.id} tier={tier} annual={annual} />
          ))}
      </div>
    </div>
  );
}
