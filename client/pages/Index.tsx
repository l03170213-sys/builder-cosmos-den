import Sidebar from "@/components/Sidebar";
import * as React from "react";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBars, CategoryDistribution, StatCard } from "@/components/dashboard";
import type { ResortAveragesResponse } from "@shared/api";
import { useQuery } from "@tanstack/react-query";
import { useChartType } from "@/hooks/useChartType";

export default function Index() {
  const chartType = useChartType("bar");

  const [serverAvailable, setServerAvailable] = React.useState<boolean | undefined>(undefined);

  // Ping server availability before running heavier queries
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = new URL('/api/ping', window.location.origin).toString();
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!mounted) return;
        setServerAvailable(r.ok);
      } catch (err) {
        console.error('Ping failed:', err);
        if (mounted) setServerAvailable(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages"],
    queryFn: async () => {
      const SHEET_ID = "1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os";
      const GID_MATRICE_MOYENNE = "1595451985";

      function parseGvizText(text: string) {
        const start = text.indexOf("(");
        const end = text.lastIndexOf(")");
        const json = text.slice(start + 1, end);
        return JSON.parse(json);
      }

      function toNumber(val: any): number | null {
        if (val == null) return null;
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const n = Number(val.replace(",", "."));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      }

      try {
        const url = new URL('/api/resort/vm-resort-albanie/averages', window.location.origin).toString();
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) {
          const text = await r.text().catch(() => r.statusText);
          throw new Error(`Server error: ${r.status} ${text}`);
        }
        return (await r.json()) as ResortAveragesResponse;
      } catch (err) {
        console.warn('API fetch failed, attempting direct Google Sheets fallback:', err);
        try {
          const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
          const rr = await fetch(gurl);
          const text = await rr.text();
          const data = parseGvizText(text);

          const cols: string[] = data.table.cols.map((c: any) => c.label || "");
          const rows: any[] = data.table.rows || [];

          // Find last non-empty row
          let lastRow = rows[rows.length - 1];
          for (let i = rows.length - 1; i >= 0; i--) {
            const rr2 = rows[i];
            const hasValue = (rr2?.c ?? []).some((cell: any) => cell && cell.v != null && cell.v !== "");
            if (hasValue) {
              lastRow = rr2;
              break;
            }
          }

          const cells = (lastRow?.c ?? []) as any[];
          const firstDataCol = 1;
          const lastDataCol = cols.length - 2;
          const categories = [] as any[];
          for (let i = firstDataCol; i <= lastDataCol; i++) {
            const label = cols[i] || `Col ${i}`;
            const val = toNumber(cells[i]?.v);
            if (val != null) categories.push({ name: label, average: val });
          }
          const overallCell = cells[cols.length - 1];
          const overallAverage = toNumber(overallCell?.v) ?? 0;
          return {
            resort: 'VM Resort Albanie',
            updatedAt: new Date().toISOString(),
            overallAverage,
            categories,
          } as ResortAveragesResponse;
        } catch (err2) {
          console.error('Direct Google Sheets fallback failed:', err2);
          throw err;
        }
      }
    },
    enabled: serverAvailable !== false,
    refetchInterval: 1000 * 60 * 10, // every 10 minutes
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery<import("@shared/api").ResortSummaryResponse>({
    queryKey: ["resort-summary"],
    queryFn: async () => {
      try {
        const url = new URL('/api/resort/vm-resort-albanie/summary', window.location.origin).toString();
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) {
          const text = await r.text().catch(() => r.statusText);
          throw new Error(`Server error: ${r.status} ${text}`);
        }
        return (await r.json()) as import("@shared/api").ResortSummaryResponse;
      } catch (err) {
        console.error('Failed fetching summary:', err);
        throw err;
      }
    },
    enabled: serverAvailable !== false,
    retry: false,
    refetchOnWindowFocus: false,
  });


  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Dashboard de VM Resort - Albanie</h2>
          </div>

          {serverAvailable === false && (
            <div className="rounded-md border border-destructive/20 bg-red-50 p-4 text-sm">
              Impossible de contacter l'API interne. Vérifiez que le serveur est démarré et que l'URL du projet autorise les requêtes vers /api. Consultez la console serveur pour plus de détails.
            </div>
          )}

          {isError && serverAvailable !== false && (
            <div className="rounded-md border border-destructive/20 bg-red-50 p-4 text-sm">
              Impossible de charger les données Google Sheets. Vérifiez le lien ou les permissions du document.
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Note Moyenne Globale" value={isLoading ? "…" : `${data?.overallAverage.toFixed(1)}/5`} subtitle={isLoading ? undefined : `Mise à jour: ${new Date(data!.updatedAt).toLocaleDateString()}`} />

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Taux de Recommandation</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{loadingSummary ? "…" : summary?.recommendationRate != null ? `${Math.round((summary.recommendationRate || 0) * 100)}%` : "—"}</div>
                <div className="mt-1 text-sm text-muted-foreground">{summary?.recommendationRate != null ? `Basé sur ${summary?.respondents || 0} répondants` : "Colonne 'recommand' introuvable"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Réponses Totales</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{loadingSummary ? "…" : summary?.respondents ?? "—"}</div>
                <div className="mt-1 text-sm text-muted-foreground">Nombre total de lignes non vides (feuille 1)</div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Type de graphique</label>
                  <select
                    aria-label="type-chart"
                    defaultValue="bar"
                    id="chart-type-select"
                    className="rounded-md border px-2 py-1 text-sm"
                    onChange={(e) => {
                      const val = e.target.value as "bar" | "line";
                      const ev = new CustomEvent("chart-type-change", { detail: val });
                      window.dispatchEvent(ev);
                    }}
                  >
                    <option value="bar">Barres</option>
                    <option value="line">Ligne</option>
                    <option value="pie">Camembert</option>
                    <option value="radar">Radar</option>
                  </select>
                </div>

                <div>
                  <button
                    onClick={async () => {
                      try {
                        const exportFn = (await import("@/components/ExportButton")).default;
                        await exportFn({ chartId: "chart-wrapper", listId: "list-wrapper", filename: "vm-resort-report.pdf" });
                      } catch (err) {
                        console.error(err);
                        alert("Erreur lors de l'export PDF");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-white text-sm"
                  >
                    Exporter PDF
                  </button>
                </div>
              </div>

              {isLoading || !data ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Notes par Catégorie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px] animate-pulse rounded-md bg-gray-200" />
                  </CardContent>
                </Card>
              ) : (
                <CategoryBars data={data.categories} id="chart-wrapper" chartType={chartType} />
              )}
            </div>
            <div>
              {isLoading || !data ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Répartition des Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="h-10 rounded bg-gray-200 animate-pulse" />
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <div id="list-wrapper">
                  <CategoryDistribution data={data.categories} />
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
