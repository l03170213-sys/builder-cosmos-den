import Sidebar from "@/components/Sidebar";
import * as React from "react";
import Header from "@/components/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CategoryBars,
  CategoryDistribution,
  StatCard,
} from "@/components/dashboard";
import type { ResortAveragesResponse } from "@shared/api";
import { useQuery } from "@tanstack/react-query";
import { useChartType } from "@/hooks/useChartType";
import { RESORTS } from "@/lib/resorts";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import { safeFetch } from "@/lib/fetcher";

export default function Index() {
  const chartType = useChartType("bar");
  const [showValues, setShowValues] = React.useState(false);
  const { resort: selectedResortKey } = useSelectedResort();
  const currentResort =
    RESORTS.find((r) => r.key === selectedResortKey) || RESORTS[0];

  const [serverAvailable, setServerAvailable] = React.useState<
    boolean | undefined
  >(undefined);

  // Ping server availability before running heavier queries
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = new URL("/api/ping", window.location.origin).toString();
        const r = await safeFetch(url, { credentials: "same-origin" });
        if (!mounted) return;
        setServerAvailable(r.ok);
      } catch (err) {
        console.error("Ping failed:", err);
        if (mounted) setServerAvailable(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages", selectedResortKey],
    queryFn: async () => {
      // sheet IDs are selected dynamically via the resort selector; use the client-selected resort when calling APIs

      function parseGvizText(text: string) {
        const start = text.indexOf("(");
        const end = text.lastIndexOf(")");
        const json = text.slice(start + 1, end);
        return JSON.parse(json);
      }

      function toNumber(val: any): number | null {
        if (val == null) return null;
        if (typeof val === "number") return Number.isFinite(val) ? val : null;
        if (typeof val === "string") {
          const s = val.replace(/\u00A0/g, "").trim();
          const m = s.match(/-?\d+[.,]?\d*/);
          if (!m) return null;
          const n = Number(m[0].replace(",", "."));
          return Number.isFinite(n) ? n : null;
        }
        if (typeof val === "object") {
          if (val.v != null) return toNumber(val.v);
          if (val.f != null) return toNumber(val.f);
        }
        return null;
      }

      function normalizeAverage(n: number | null): number | null {
        if (n == null) return null;
        if (n < 0 || n > 5) return null;
        return n;
      }

      const cfg = currentResort;
      try {
        const selected = selectedResortKey;
        const url = new URL(
          `/api/resort/${selected}/averages`,
          window.location.origin,
        ).toString();
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r
          .clone()
          .text()
          .catch(() => "");
        if (!r.ok) {
          throw new Error(`Server error: ${r.status} ${text}`);
        }
        try {
          return JSON.parse(text) as ResortAveragesResponse;
        } catch (e) {
          throw new Error(`Invalid JSON response: ${text}`);
        }
      } catch (err) {
        // Do not attempt client-side Google Sheets fetches here — surface API errors
        console.error("API fetch failed:", err);
        throw err;
      }
    },
    enabled: serverAvailable !== false,
    refetchInterval: 30000, // every 30 seconds
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: summary, isLoading: loadingSummary } = useQuery<
    import("@shared/api").ResortSummaryResponse
  >({
    queryKey: ["resort-summary", selectedResortKey],
    queryFn: async () => {
      function parseGvizText(text: string) {
        const start = text.indexOf("(");
        const end = text.lastIndexOf(")");
        const json = text.slice(start + 1, end);
        return JSON.parse(json);
      }

      function valueToString(v: any) {
        if (v == null) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (v && typeof v === "object" && v.v != null)
          return String(v.v).trim();
        return String(v);
      }

      try {
        const selected = selectedResortKey;
        const cfg = currentResort;
        const url = new URL(
          `/api/resort/${selected}/summary`,
          window.location.origin,
        ).toString();
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r
          .clone()
          .text()
          .catch(() => "");
        if (!r.ok) {
          throw new Error(`Server error: ${r.status} ${text}`);
        }
        try {
          return JSON.parse(
            text,
          ) as import("@shared/api").ResortSummaryResponse;
        } catch (e) {
          throw new Error(`Invalid JSON response: ${text}`);
        }
      } catch (err) {
        console.error("API summary fetch failed:", err);
        throw err;
      }
    },
    enabled: serverAvailable !== false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const overallDisplay = isLoading
    ? "…"
    : data
      ? `${data.overallAverage.toFixed(1)}/5`
      : "—";
  const updatedSubtitle = isLoading
    ? undefined
    : data && data.updatedAt
      ? `Mise à jour: ${new Date(data.updatedAt).toLocaleDateString()}`
      : undefined;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              Dashboard — {currentResort.name}
            </h2>
          </div>

          {serverAvailable === false && (
            <div className="rounded-md border border-destructive/20 bg-red-50 p-4 text-sm">
              Impossible de contacter l'API interne. Vérifiez que le serveur est
              démarré et que l'URL du projet autorise les requêtes vers /api.
              Consultez la console serveur pour plus de détails.
            </div>
          )}

          {isError && serverAvailable !== false && (
            <div className="rounded-md border border-destructive/20 bg-red-50 p-4 text-sm">
              Impossible de charger les données Google Sheets. Vérifiez le lien
              ou les permissions du document.
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Note Moyenne Globale"
              value={overallDisplay}
              subtitle={updatedSubtitle}
            />

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Taux de Recommandation</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">
                  {loadingSummary
                    ? "…"
                    : summary?.recommendationRate != null
                      ? `${Math.round((summary.recommendationRate || 0) * 100)}%`
                      : "—"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {summary?.recommendationRate != null
                    ? `Bas�� sur ${summary?.respondents || 0} répondants`
                    : "Colonne 'recommand' introuvable"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Réponses Totales</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">
                  {loadingSummary ? "…" : (summary?.respondents ?? "—")}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Nombre total de lignes non vides (feuille 1)
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">
                    Type de graphique
                  </label>
                  <select
                    aria-label="type-chart"
                    defaultValue="bar"
                    id="chart-type-select"
                    className="rounded-md border px-2 py-1 text-sm"
                    onChange={(e) => {
                      const val = e.target.value as
                        | "bar"
                        | "line"
                        | "pie"
                        | "radar";
                      const ev = new CustomEvent("chart-type-change", {
                        detail: val,
                      });
                      window.dispatchEvent(ev);
                    }}
                  >
                    <option value="bar">Barres</option>
                    <option value="line">Ligne</option>
                    <option value="pie">Camembert</option>
                    <option value="radar">Radar</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="export-graphique"
                    onClick={async () => {
                      try {
                        setShowValues(true);
                        await new Promise((r) =>
                          requestAnimationFrame(() => r(undefined)),
                        );
                        // small delay to ensure labels render
                        await new Promise((r) => setTimeout(r, 80));
                        const html2canvas = (await import("html2canvas"))
                          .default;
                        const el = document.getElementById("chart-wrapper");
                        if (!el) throw new Error("Chart element not found");
                        const canvas = await html2canvas(el, {
                          scale: 2,
                          backgroundColor: "#ffffff",
                          useCORS: true,
                        });
                        const dataUrl = canvas.toDataURL("image/png");
                        const a = document.createElement("a");
                        a.href = dataUrl;
                        a.download = "vm-resort-chart.png";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      } catch (err) {
                        console.error(err);
                        alert("Erreur lors de l'export du graphique");
                      } finally {
                        setShowValues(false);
                      }
                    }}
                    aria-label="Exporter graphique"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    Exporter graphique
                  </button>

                  <button
                    id="export-all-graphics"
                    onClick={async () => {
                      try {
                        const exportModule = await import("@/components/ExportButton");
                        if (exportModule && exportModule.exportAllHotels) {
                          await exportModule.exportAllHotels({ mode: "graphics" });
                        } else {
                          alert("Fonction d'export groupé non disponible");
                        }
                      } catch (err) {
                        console.error(err);
                        alert("Erreur lors de l'export de tous les graphiques");
                      }
                    }}
                    aria-label="Exporter tous les graphiques"
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    Exporter tous les graphiques
                  </button>

                  <button
                    id="export-officiel"
                    onClick={async () => {
                      try {
                        const exportFn = (
                          await import("@/components/ExportButton")
                        ).default;
                        // Official export: uses the pdf-summary content and list-wrapper to build a 2-page PDF matching the provided template
                        await exportFn({
                          chartId: "chart-wrapper",
                          listId: "list-wrapper",
                          summaryId: "pdf-summary",
                          filename: "vm-resort-officiel.pdf",
                        });
                      } catch (err) {
                        console.error(err);
                        alert("Erreur lors de l'export PDF (format officiel)");
                      }
                    }}
                    aria-label="Exporter PDF officiel"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-white text-sm"
                  >
                    Exporter (format officiel)
                  </button>

                  <button
                    id="export-all-official"
                    onClick={async () => {
                      try {
                        const exportModule = await import("@/components/ExportButton");
                        if (exportModule && exportModule.exportAllHotels) {
                          await exportModule.exportAllHotels({ mode: "official" });
                        } else {
                          alert("Fonction d'export groupé non disponible");
                        }
                      } catch (err) {
                        console.error(err);
                        alert("Erreur lors de l'export officiel de tous les hôtels");
                      }
                    }}
                    aria-label="Exporter tous les officiels"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-white text-sm"
                  >
                    Exporter tous (format officiel)
                  </button>
                </div>
              </div>

              {isLoading || !data ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Notes par Catégorie
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px] animate-pulse rounded-md bg-gray-200" />
                  </CardContent>
                </Card>
              ) : (
                <CategoryBars
                  data={data.categories}
                  id="chart-wrapper"
                  chartType={chartType}
                  showValues={showValues}
                />
              )}
            </div>
            <div>
              {isLoading || !data ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Répartition des Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 rounded bg-gray-200 animate-pulse"
                      />
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

          {/* Hidden PDF summary used for page 2 generation */}
          <div
            id="pdf-summary"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", top: "-9999px" }}
          >
            <div
              className="max-w-screen-2xl mx-auto px-4 py-6"
              style={{
                fontFamily: "Inter, Arial, Helvetica, sans-serif",
                color: "#0f172a",
              }}
            >
              <div className="grid grid-cols-3 gap-4">
                <div
                  className="rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Moyenne générale
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    {data ? `${data.overallAverage.toFixed(1)}/5` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data ? `Moyenne global (feuille matrice moyenne)` : ""}
                  </div>
                </div>

                <div
                  className="rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Nombre de r��ponses
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    {summary ? `${summary.respondents ?? "—"}` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Nombre de lignes (réponses)
                  </div>
                </div>

                <div
                  className="rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Taux de Recommandation
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    {summary && summary.recommendationRate != null
                      ? `${Math.round(summary.recommendationRate * 100)}%`
                      : "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summary
                      ? `Basé sur ${summary.respondents || 0} répondants`
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
