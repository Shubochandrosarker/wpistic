"use client";

import { useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Icon } from "@/components/ui/Icon";
import type { Product, ProductCategory } from "@/lib/products";

export function ProductsExplorer({
  products,
  categories,
}: {
  products: Product[];
  categories: ProductCategory[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "All">("All");

  const filtered = products.filter((p) => {
    const matchesCategory = category === "All" || p.category === category;
    const matchesQuery =
      !query ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.tagline.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 sm:max-w-xs">
          <Icon name="search" size={16} className="text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["All", ...categories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                category === c
                  ? "bg-ink-900 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-150"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 text-center text-ink-500">
          No products match “{query}”. Try a different search term.
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
