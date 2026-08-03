import { useEffect, useState } from "react";
import { api, ApiError, type LeaderboardEntry } from "../../lib/api.js";
import { Avatar, Badge, Card, EmptyState, ErrorText, SkeletonList } from "../../components/ui.js";

export default function LeaderboardTab({ ws, proj }: { ws: string; proj: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const { leaderboard } = await api.leaderboard.get(ws, proj);
      setEntries(leaderboard);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error cargando el leaderboard");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, proj]);

  if (loading)
    return (
      <Card>
        <SkeletonList rows={4} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      <Card>
        <h3 className="text-h4 text-ink-900">Leaderboard</h3>
        <p className="mt-1 text-body-sm text-ink-500">
          HUs cerradas por quien realmente movió la tarjeta a "Hecho" — persona o agente.
        </p>

        <div className="mt-4">
          {entries.length === 0 ? (
            <EmptyState
              title="Todavía no se cerró ninguna HU"
              description="En cuanto una persona o un agente mueva una tarjeta a Hecho, aparece acá."
            />
          ) : (
            <div className="divide-y divide-line-100">
              {entries.map((entry) => (
                <div
                  key={`${entry.actorType}:${entry.actorId}`}
                  className="flex items-center gap-3 -mx-6 px-6 py-3 hover:bg-surface-50"
                >
                  <Avatar label={entry.actorName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body font-semibold text-ink-900">
                        {entry.actorName}
                      </span>
                      <Badge tone={entry.actorType === "agent" ? "brand" : "neutral"} dot mono>
                        {entry.actorType === "agent" ? "Agente" : "Persona"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-4 font-mono text-caption text-ink-400">
                    <span>{entry.storiesClosed} {entry.storiesClosed === 1 ? "HU" : "HUs"}</span>
                    <span>{entry.pointsDelivered} pts</span>
                    <span>{entry.avgDaysToClose != null ? `${entry.avgDaysToClose}d prom.` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
