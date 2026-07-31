export type HowItWorksStep = { step: string; title: string; description: string };

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: "01",
    title: "Workspace",
    description: "Crea tu workspace, invita al equipo y organiza varios proyectos en un solo lugar.",
  },
  {
    step: "02",
    title: "Proyecto",
    description: "Define el objetivo del proyecto y los dominios que te importan: api, infra, ui, datos.",
  },
  {
    step: "03",
    title: "GitHub",
    description: "Conecta el repo. Pemie ingiere los commits y los clasifica por dominio, sin trabajo manual.",
  },
  {
    step: "04",
    title: "Agente",
    description: "Genera una API key con scopes. Cursor, Hermes o Telegram trabajan sobre la misma verdad.",
  },
];
