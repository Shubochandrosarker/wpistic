import { Eyebrow } from "./Eyebrow";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""} ${className}`}>
      {eyebrow && <Eyebrow className={align === "center" ? "justify-center" : ""}>{eyebrow}</Eyebrow>}
      <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-balance text-ink-900 sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-4 text-lg leading-relaxed text-ink-600">{description}</p>}
    </div>
  );
}
