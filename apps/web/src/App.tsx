import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { safeNextPath, useAuth } from "./lib/auth.js";
import { Layout } from "./components/Layout.js";
import { Spinner } from "./components/ui.js";
import Login from "./pages/Login.js";
import Register from "./pages/Register.js";
import Workspaces from "./pages/Workspaces.js";
import Workspace from "./pages/Workspace.js";
import Project from "./pages/Project.js";
import AcceptInvite from "./pages/AcceptInvite.js";

export default function App() {
  const { loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/invite/:token" element={<AcceptInvite />} />

      <Route path="/" element={<Protected><Workspaces /></Protected>} />
      <Route path="/w/:slug" element={<Protected><Workspace /></Protected>} />
      <Route path="/w/:slug/p/:projectSlug" element={<Protected><Project /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Envuelve rutas que requieren sesión; redirige a /login recordando el destino
 * en `?next=` (no en el state del router: así sobrevive a un recargar de página
 * y al viaje redondo del OAuth de GitHub).
 */
function Protected({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Layout>{children}</Layout>;
}

/** Rutas solo para invitados (login/register); redirige a la app si ya hay sesión. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  if (user) return <Navigate to={safeNextPath(params.get("next"))} replace />;
  return <>{children}</>;
}
