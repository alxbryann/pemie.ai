import type { ReactNode } from "react";
import { Eyebrow } from "../../../components/ui.js";

export function SectionIntro({
  eyebrow,
  title,
  titleId,
  description,
  onInk = false,
  align = "left",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  description?: ReactNode;
  onInk?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`${align === "center" ? "mx-auto max-w-narrow text-center" : ""} ${className}`}>
      <Eyebrow className={`mb-3.5 block ${onInk ? "text-accent-onink" : ""}`}>{eyebrow}</Eyebrow>
      <h2 id={titleId} className={`text-h3 sm:text-h2 ${onInk ? "text-on-ink" : "text-ink-900"}`}>
        {title}
      </h2>
      {description ? (
        <p className={`mt-4 text-body-lg leading-relaxed ${onInk ? "text-on-ink-soft" : "text-ink-600"}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
