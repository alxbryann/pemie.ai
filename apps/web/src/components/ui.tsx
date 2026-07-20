// Kit de UI de pemie.ai — implementa el design system sobre Tailwind + tokens CSS.
// Reglas del sistema: radios sm/md/lg, borde hairline, sombra fría, acento azul único,
// mono (IBM Plex) para etiquetas, comandos y métricas.

import { useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ---------------------------------- forms --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "mono";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white border border-blue-600 shadow-xs hover:bg-blue-700 hover:border-blue-700 hover:-translate-y-px hover:shadow-md active:translate-y-0",
  secondary:
    "bg-surface-0 text-ink-900 border border-line-200 hover:bg-surface-50 hover:border-ink-300",
  ghost: "bg-transparent text-ink-800 border border-transparent hover:bg-surface-100",
  danger: "bg-surface-0 text-red-600 border border-red-100 hover:bg-red-100",
  mono: "bg-surface-100 text-ink-800 border border-line-200 font-mono font-medium hover:bg-surface-0 hover:border-ink-300",
};

const BUTTON_SIZES = {
  sm: "px-3.5 py-2 text-body-sm rounded-sm gap-1.5",
  md: "px-5 py-2.5 text-body rounded-md gap-2",
  lg: "px-6 py-3.5 text-[16px] rounded-md gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap font-semibold leading-none transition-[background-color,border-color,transform,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  );
}

// Los inputs comparten el mismo tratamiento: radio sm, borde hairline, anillo azul de 3px.
// Sin utilidad de ancho: cada control decide, para que `className` pueda sobreescribirlo.
const CONTROL =
  "rounded-sm border border-line-200 bg-surface-0 px-3.5 py-2.5 text-body text-ink-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-400 focus:border-blue-600 focus:shadow-focus disabled:bg-surface-50 disabled:text-ink-400";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} w-full ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} w-full leading-snug ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-body-sm font-semibold text-ink-800">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-caption text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-body-sm text-ink-800"
    >
      <span
        className={`relative h-[22px] w-[38px] rounded-pill transition-colors duration-150 ${
          checked ? "bg-blue-600" : "bg-ink-300"
        }`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-pill bg-white shadow-xs transition-[left] duration-200 ease-overshoot ${
            checked ? "left-[19px]" : "left-[3px]"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

/* --------------------------------- display -------------------------------- */

const CARD_PADDING = { sm: "p-3", md: "p-6", none: "" };

export function Card({
  className = "",
  interactive = false,
  padding = "md",
  children,
}: {
  className?: string;
  interactive?: boolean;
  padding?: keyof typeof CARD_PADDING;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-line-200 bg-surface-0 shadow-xs transition-[box-shadow,border-color,transform] duration-150 ${
        CARD_PADDING[padding]
      } ${
        interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-body-sm text-[#b8353a]">{children}</p>;
}

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-surface-100 text-ink-700", dot: "bg-ink-400" },
  brand: { chip: "bg-blue-100 text-blue-700", dot: "bg-blue-600" },
  success: { chip: "bg-green-100 text-[#0d7a51]", dot: "bg-green-600" },
  warning: { chip: "bg-amber-100 text-[#8a5e0a]", dot: "bg-amber-600" },
  danger: { chip: "bg-red-100 text-[#b8353a]", dot: "bg-red-600" },
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  mono = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  mono?: boolean;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 leading-snug ${t.chip} ${
        mono ? "font-mono text-mono-label font-medium uppercase" : "text-caption font-semibold"
      }`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-pill ${t.dot}`} /> : null}
      {children}
    </span>
  );
}

// Métricas siempre en mono: es la convención de "proof points" del sistema.
export function Stat({
  value,
  label,
  delta,
  deltaTone = "success",
}: {
  value: ReactNode;
  label: string;
  delta?: string;
  deltaTone?: "success" | "danger" | "neutral";
}) {
  const tone = {
    success: "text-[#0d7a51]",
    danger: "text-[#b8353a]",
    neutral: "text-ink-400",
  }[deltaTone];
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[30px] font-semibold leading-none tracking-[-0.01em] text-ink-900">
          {value}
        </span>
        {delta ? <span className={`font-mono text-caption font-medium ${tone}`}>{delta}</span> : null}
      </div>
      <div className="mt-1.5 text-body-sm text-ink-500">{label}</div>
    </div>
  );
}

// El panel de terminal es el motivo firma de pemie: chrome macOS, prompt azul, copiar.
export function CodeBlock({
  children,
  command,
  title = "bash",
  copyable = true,
  className = "",
}: {
  children?: ReactNode;
  command?: string;
  title?: string;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = command ?? (typeof children === "string" ? children : "");

  function copy() {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      className={`overflow-hidden rounded-md border border-ink-800 bg-ink-900 font-mono ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-pill bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-pill bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-pill bg-[#28c840]" />
        <span className="ml-1.5 text-mono-label text-ink-400">{title}</span>
        {copyable && text ? (
          <button
            type="button"
            onClick={copy}
            className={`ml-auto text-mono-label transition-colors ${
              copied ? "text-blue-300" : "text-ink-400 hover:text-white"
            }`}
          >
            {copied ? "copied" : "copy"}
          </button>
        ) : null}
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-body-sm leading-relaxed text-[#e6ebff]">
        <code>
          {command ? (
            <>
              <span className="select-none text-blue-300">$ </span>
              {command}
            </>
          ) : (
            children
          )}
        </code>
      </pre>
    </div>
  );
}

/* -------------------------------- navigation ------------------------------ */

export type TabItem = { id: string; label: string; count?: number };

export function Tabs({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex flex-nowrap gap-1 overflow-x-auto border-b border-line-200 ${className}`}
    >
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            className={`relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 pb-3 pt-2.5 text-[14px] transition-colors duration-150 ${
              on ? "font-semibold text-ink-900" : "font-medium text-ink-500 hover:text-ink-800"
            }`}
          >
            {it.label}
            {it.count != null ? (
              <span
                className={`rounded-pill px-1.5 py-px font-mono text-mono-label ${
                  on ? "bg-blue-100 text-blue-600" : "bg-surface-100 text-ink-400"
                }`}
              >
                {it.count}
              </span>
            ) : null}
            <span
              className={`absolute inset-x-0 -bottom-px h-0.5 rounded-sm ${
                on ? "bg-blue-600" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- utility -------------------------------- */

// Eyebrow mono en mayúsculas — la etiqueta de sección del sistema.
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <Eyebrow className="mb-2 block">{eyebrow}</Eyebrow> : null}
        <h1 className="text-h2 text-ink-900">{title}</h1>
        {description ? <p className="mt-2 text-body text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  // `compact` para huecos estrechos (columnas de tablero), donde el bloque completo pesa demasiado.
  if (compact) {
    return (
      <p className="rounded-md border border-dashed border-ink-300 px-3 py-5 text-center text-body-sm text-ink-400">
        {title}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-line-200 bg-surface-50 px-6 py-12 text-center">
      <p className="text-h4 text-ink-900">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-body-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <span className="eyebrow animate-pulse">cargando</span>
    </div>
  );
}

// Marca: apertura azul + wordmark en Sora 700, siempre en minúsculas, ".ai" en acento.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label="pemie.ai">
      <defs>
        <mask id="pemie-aperture">
          <rect width="72" height="72" fill="#fff" />
          <circle cx="47" cy="25" r="20" fill="#000" />
        </mask>
      </defs>
      <circle cx="36" cy="36" r="28" fill="var(--blue-600)" mask="url(#pemie-aperture)" />
      <circle cx="49" cy="23" r="6" fill="var(--blue-600)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="text-[19px] font-bold tracking-[-0.02em] text-ink-900">
      pemie<span className="text-blue-600">.ai</span>
    </span>
  );
}
