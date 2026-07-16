import { Icon } from "./Icon";
import type { ProductCategory } from "@/lib/products";

const CATEGORY_STYLE: Record<ProductCategory, { bg: string; fg: string }> = {
  "AI & Automation": { bg: "bg-purple-100", fg: "text-purple-600" },
  "Business Tools": { bg: "bg-green-100", fg: "text-green-700" },
  Analytics: { bg: "bg-blue-100", fg: "text-blue-700" },
  "WordPress Plugins": { bg: "bg-amber-100", fg: "text-amber-700" },
};

export function ProductGlyph({
  category,
  icon,
  size = 44,
}: {
  category: ProductCategory;
  icon: string;
  size?: number;
}) {
  const style = CATEGORY_STYLE[category];
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-2xl ${style.bg} ${style.fg}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </div>
  );
}
