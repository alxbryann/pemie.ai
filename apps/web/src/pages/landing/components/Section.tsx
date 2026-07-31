// Wrapper de sección: controla fondo, padding vertical y el `aria-labelledby`
// que conecta cada `<section>` con su título, sin repetirlo en cada archivo.

import { type ReactNode, useId } from "react";

type SectionTone = "default" | "subtle" | "ink";

const TONE_CLASSES: Record<SectionTone, string> = {
  default: "bg-surface-0",
  subtle: "bg-surface-50",
  ink: "bg-surface-ink text-on-ink",
};

export function Section({
  id,
  tone = "default",
  titleId: titleIdProp,
  className = "",
  children,
}: {
  id?: string;
  tone?: SectionTone;
  titleId?: string;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const titleId = titleIdProp ?? generatedId;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24 lg:py-28 ${TONE_CLASSES[tone]} ${className}`}
    >
      <div className="mx-auto max-w-container">{children}</div>
    </section>
  );
}

export function sectionTitleId(id: string) {
  return `${id}-title`;
}
