import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Project as Prj } from "../lib/api.js";
import { Badge, Card, PageHeader, Spinner, Tabs } from "../components/ui.js";
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
    <div>
      <Link to={`/w/${slug}`} className="mb-1 block text-body-sm text-ink-400 hover:text-ink-700">
        ← {project.workspace.name}
      </Link>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={<Badge tone="neutral" mono>{project.key}</Badge>}
      />

      <Tabs
        items={[...TABS]}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        className="mb-6"
      />

      {tab === "commits" && <CommitsTab ws={slug} proj={projectSlug} />}
      {tab === "reports" && <ReportsTab ws={slug} proj={projectSlug} />}
      {tab === "stories" && <StoriesTab ws={slug} proj={projectSlug} />}
      {tab === "board" && <BoardTab ws={slug} proj={projectSlug} />}
      {tab === "agent" && <AgentTab ws={slug} proj={projectSlug} projectId={project.id} />}
    </div>
  );
}
