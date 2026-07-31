// Guiones de la demo de terminal del hero: cada uno es un comando `pemie` y su
// salida coloreada, reproducidos con efecto typewriter por useTerminalPlayback.
// Puerto del script `<x-dc>` original (Pemie Landing.dc.html) a datos tipados.

export type TerminalSegment = { text: string; tone: TerminalTone };
export type TerminalTone = "default" | "accent" | "muted" | "string";
export type TerminalScript = {
  id: string;
  label: string;
  command: string;
  lines: TerminalSegment[][];
};

const seg = (text: string, tone: TerminalTone = "default"): TerminalSegment => ({ text, tone });

export const TERMINAL_SCRIPTS: TerminalScript[] = [
  {
    id: "report",
    label: "report",
    command: "pemie report --project atlas --semana 31",
    lines: [
      [seg("Avance 68% → "), seg("74%", "accent"), seg(" · 12 commits · 3 HUs cerradas")],
      [
        seg("evidencia  ", "muted"),
        seg("a41f2c9", "accent"),
        seg(" api/auth · ", "muted"),
        seg("7d03be1", "accent"),
        seg(" infra/ci · ", "muted"),
        seg("c9e0d12", "accent"),
        seg(" ui/kanban", "muted"),
      ],
      [seg("audit      key tl-cursor · scope reports:read · 09:41", "muted")],
    ],
  },
  {
    id: "tools",
    label: "tools",
    command: "pemie tools --list",
    lines: [
      [seg("get_report     ", "string"), seg("reports:read   ", "accent"), seg("objetivo e informes de avance", "muted")],
      [seg("list_commits   ", "string"), seg("commits:read   ", "accent"), seg("ingesta clasificada por dominio", "muted")],
      [seg("move_story     ", "string"), seg("stories:write  ", "accent"), seg("HUs y kanban", "muted")],
    ],
  },
  {
    id: "kanban",
    label: "kanban",
    command: "pemie story move HU-12 --to hecho",
    lines: [
      [seg("HU-12 → "), seg("hecho", "string"), seg(" · evidencia ", "muted"), seg("c9e0d12", "accent")],
      [seg("audit      key tl-cursor · scope stories:write · 09:44", "muted")],
    ],
  },
  {
    id: "audit",
    label: "audit",
    command: "pemie audit --tail 3",
    lines: [
      [seg("09:41 · tl-cursor · get_report · reports:read", "muted")],
      [seg("09:44 · tl-cursor · move_story HU-12 · stories:write", "muted")],
      [seg("09:52 · tg-canal · get_report · reports:read", "muted")],
    ],
  },
];
