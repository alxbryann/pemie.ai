import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Project as Prj } from "../lib/api.js";
import { Badge, Card, Spinner } from "../components/ui.js";

// Detalle de proyecto. En F1 es un esqueleto; las fases F2–F6 llenan las
// secciones (ingesta/commits, informes, HUs, kanban).
const PHASES = [
  { title: "Ingesta de commits", phase: "F2", desc: "Conecta repos de GitHub y clasifica commits." },
  { title: "Objetivo e informes", phase: "F3", desc: "Meta del proyecto, informes de agentes y notas." },
  { title: "Historias de usuario", phase: "F5", desc: "Generación y gestión de HUs." },
  { title: "Kanban", phase: "F6", desc: "Tablero de tareas y flujo del equipo." },
];

export default function Project() {
  const { slug = "", projectSlug = "" } = useParams();
  const [project, setProject] = useState<Prj | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <div className="grid gap-3 sm:grid-cols-2">
        {PHASES.map((s) => (
          <Card key={s.phase} className="opacity-70">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{s.title}</h2>
              <Badge>{s.phase}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{s.desc}</p>
            <p className="mt-2 text-xs text-slate-400">Próximamente</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
