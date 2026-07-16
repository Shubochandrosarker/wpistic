import { Card } from "./Card";
import { Icon } from "./Icon";
import type { Testimonial } from "@/lib/testimonials";

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Card className="flex flex-col">
      <Icon name="quote" size={24} className="text-purple-300" />
      <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-800">“{testimonial.quote}”</p>
      <div className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-green-500 to-purple-500 text-sm font-bold text-white">
          {testimonial.name
            .split(" ")
            .map((p) => p[0])
            .join("")}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink-900">{testimonial.name}</div>
          <div className="truncate text-xs text-ink-500">
            {testimonial.role}, {testimonial.company}
          </div>
        </div>
      </div>
    </Card>
  );
}
