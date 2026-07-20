import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Project as Prj } from "../lib/api.js";
import { Badge, Card, Spinner } from "../components/ui.js";
import CommitsTab from "./project/CommitsTab.js";
import ReportsTab from "./project/ReportsTab.js";
import StoriesTab from "./project/StoriesTab.js";
import BoardTab from "./project/BoardTab.js";
import AgentTab from "./project/AgentTab.js";

const TABS = [
  { id: "commits", label: "Ingesta de commits" },
  { id: "reports", label: "Objetivo e informes" },
  { id: "stories", label: "Historias de usuario" },
  { id: "board", label: "Kanban" },
  { id: "agent", label: "Agente (MCP)" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Project() {
  const { slug = "", projectSlug = "" } = useParams();
  const [project, setProject] = useState<Prj | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("commits");

  useEffect(() => {
    api.projects
      .get(slug, projectSlug)
      .then((r) => setProject(r.project))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "No se pudo cargar el proyecto")
      );
  }, [slug, projectSlug]);

  if (error) return <Card className="text-red-600">{error}</Card>;
  if (!project) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/w/${slug}`} className="text-sm text-slate-400 hover:underline">
          ← {project.workspace.name}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <Badge>{project.key}</Badge>
        </div>
        {project.description && <p className="mt-1 text-slate-500">{project.description}</p>}
      </div>

      {/* Navegación por pestañas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "commits" && <CommitsTab ws={slug} proj={projectSlug} />}
      {tab === "reports" && <ReportsTab ws={slug} proj={projectSlug} />}
      {tab === "stories" && <StoriesTab ws={slug} proj={projectSlug} />}
      {tab === "board" && <BoardTab ws={slug} proj={projectSlug} />}
      {tab === "agent" && <AgentTab ws={slug} proj={projectSlug} projectId={project.id} />}
    </div>
  );
}
