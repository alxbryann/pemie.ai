import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type InvitationDetail } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { Button, Card, ErrorText, Spinner } from "../components/ui.js";
import { AuthShell } from "./Login.js";

export default function AcceptInvite() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<InvitationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.invitations
      .detail(token)
      .then((r) => setDetail(r.invitation))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Invitación inválida"));
  }, [token]);

  async function onAccept() {
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await api.invitations.accept(token);
      navigate(`/w/${workspace.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aceptar");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <AuthShell title="Invitación" subtitle="No pudimos cargar esta invitación.">
        <ErrorText>{error}</ErrorText>
      </AuthShell>
    );
  }
  if (!detail) return <Spinner />;

  return (
    <AuthShell
      title={`Únete a ${detail.workspace.name}`}
      subtitle={`Invitación para ${detail.email} · rol ${detail.role}`}
    >
      {detail.expired ? (
        <Card className="text-center text-slate-500">Esta invitación expiró.</Card>
      ) : !user ? (
        <p className="text-center text-sm text-slate-500">
          Inicia sesión o regístrate con <span className="font-medium">{detail.email}</span> para
          aceptar la invitación.
          <span className="mt-4 block">
            <Button
              className="w-full"
              onClick={() => navigate(`/login?next=/invite/${token}`)}
            >
              Iniciar sesión
            </Button>
          </span>
        </p>
      ) : (
        <div className="space-y-3">
          <Button className="w-full" onClick={onAccept} disabled={busy}>
            {busy ? "Aceptando…" : "Aceptar invitación"}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </AuthShell>
  );
}
