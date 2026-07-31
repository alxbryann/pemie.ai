export type DemoCard = { key: string; title: string; trail?: string };
export type DemoColumn = { title: string; count: number; cards: DemoCard[] };

export const DEMO_KANBAN: DemoColumn[] = [
  {
    title: "backlog",
    count: 4,
    cards: [
      { key: "HU-18", title: "Exportar informe semanal" },
      { key: "HU-19", title: "Filtro por dominio en commits" },
    ],
  },
  {
    title: "en curso",
    count: 2,
    cards: [
      { key: "HU-15", title: "Sesiones con refresh tokens", trail: "↳ a41f2c9" },
      { key: "HU-16", title: "Onboarding de workspace" },
    ],
  },
  {
    title: "hecho",
    count: 7,
    cards: [
      { key: "HU-12", title: "Ingesta inicial de GitHub", trail: "↳ movida por agente tl-cursor" },
      { key: "HU-14", title: "Dominios configurables" },
    ],
  },
];
