/** @type {import('tailwindcss').Config} */
// El tema refleja los tokens del design system de pemie.ai (src/styles/tokens/).
// Las utilidades apuntan a las CSS vars: los tokens siguen siendo la fuente de verdad.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "var(--ink-900)",
          800: "var(--ink-800)",
          700: "var(--ink-700)",
          600: "var(--ink-600)",
          500: "var(--ink-500)",
          400: "var(--ink-400)",
          300: "var(--ink-300)",
        },
        surface: {
          0: "var(--surface-0)",
          50: "var(--surface-50)",
          100: "var(--surface-100)",
        },
        line: {
          200: "var(--line-200)",
          100: "var(--line-100)",
        },
        blue: {
          700: "var(--blue-700)",
          600: "var(--blue-600)",
          500: "var(--blue-500)",
          300: "var(--blue-300)",
          100: "var(--blue-100)",
        },
        green: { 600: "var(--green-600)", 100: "var(--green-100)" },
        amber: { 600: "var(--amber-600)", 100: "var(--amber-100)" },
        red: { 600: "var(--red-600)", 100: "var(--red-100)" },

        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-tint": "var(--accent-tint)",
      },
      fontFamily: {
        sans: ["Sora", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        display: ["56px", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        h1: ["42px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        h2: ["32px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        h3: ["24px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        h4: ["19px", { lineHeight: "1.35", letterSpacing: "-0.02em" }],
        "body-lg": ["17px", { lineHeight: "1.55" }],
        body: ["15px", { lineHeight: "1.55" }],
        "body-sm": ["13px", { lineHeight: "1.55" }],
        caption: ["12px", { lineHeight: "1.4" }],
        "mono-label": ["11px", { lineHeight: "1.4", letterSpacing: "0.06em" }],
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
      },
      maxWidth: {
        container: "var(--container)",
        narrow: "var(--container-narrow)",
      },
      transitionTimingFunction: {
        overshoot: "cubic-bezier(.34,1.56,.64,1)",
      },
    },
  },
  plugins: [],
};
