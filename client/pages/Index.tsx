import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBars, CategoryDistribution, StatCard } from "@/components/dashboard";
import type { ResortAveragesResponse } from "@shared/api";
import { useQuery } from "@tanstack/react-query";
import { useChartType } from "@/hooks/useChartType";

export default function Index() {
  const chartType = useChartType("bar");
  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages"],
    queryFn: async () => {
      const r = await fetch("/api/resort/vm-resort-albanie/averages");
      if (!r.ok) throw new Error("Network error");
      return (await r.json()) as ResortAveragesResponse;
    },
    refetchInterval: 1000 * 60 * 10, // every 10 minutes
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

          {isError && (
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
                <div className="text-3xl font-semibold">—</div>
                <div className="mt-1 text-sm text-muted-foreground">À configurer si disponible dans la feuille</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Réponses Mensuelles</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">—</div>
                <div className="mt-1 text-sm text-muted-foreground">Basé sur vos données</div>
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
                <CategoryBars data={data.categories} id="chart-wrapper" />
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
