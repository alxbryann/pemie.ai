import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth.js";
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

/** Envuelve rutas que requieren sesión; redirige a /login si no hay usuario. */
function Protected({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Layout>{children}</Layout>;
}

/** Rutas solo para invitados (login/register); redirige a la app si ya hay sesión. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
