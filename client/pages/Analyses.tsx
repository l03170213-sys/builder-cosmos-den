import React from "react";
import ChartOnly from "@/components/ChartOnly";
import { useQuery } from "@tanstack/react-query";
import type { ResortAveragesResponse } from "@shared/api";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import { RESORTS } from "@/lib/resorts";
import { safeFetch } from "@/lib/fetcher";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

export default function Analyses() {
  const { resort: selectedResortKey } = useSelectedResort();
  const currentResort = RESORTS.find((r) => r.key === selectedResortKey) || RESORTS[0];

  // fetch averages for the selected resort (existing behavior)
  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages-analyses", selectedResortKey],
    queryFn: async () => {
      const selected = selectedResortKey;
      const url = new URL(`/api/resort/${selected}/averages`, window.location.origin).toString();
      const r = await safeFetch(url, { credentials: "same-origin" });
      const text = await r.clone().text().catch(() => "");
      if (!r.ok) throw new Error(`Server error: ${r.status} ${text}`);
      return JSON.parse(text) as ResortAveragesResponse;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // fetch averages for all resorts to build inter-hotel comparisons
  const allResortsQuery = useQuery({
    queryKey: ["all-resorts-averages"],
    queryFn: async () => {
      const promises = RESORTS.map(async (r) => {
        const url = new URL(`/api/resort/${r.key}/averages`, window.location.origin).toString();
        const resp = await safeFetch(url, { credentials: "same-origin" });
        if (!resp.ok) return { key: r.key, name: r.name, error: true };
        const json = (await resp.json()) as ResortAveragesResponse;
        return { key: r.key, name: r.name, overall: json.overallAverage, categories: json.categories };
      });
      return Promise.all(promises);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // state for selected hotels to compare
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>(() => [RESORTS[0]?.key].filter(Boolean));

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev.slice(0, 8), key]));
  };

  // Build bar chart data for inter-hotel overall comparison
  const interHotelData = (allResortsQuery.data || [])
    .filter((r: any) => !r.error && typeof r.overall === "number")
    .map((r: any) => ({ name: r.name, overall: Number(r.overall) }));

  // Build radar chart data for selected hotels (merge categories)
  const radarData = React.useMemo(() => {
    const items = (allResortsQuery.data || []).filter((r: any) => selectedKeys.includes(r.key) && !r.error);
    if (items.length === 0) return [];
    // union of category names
    const catNames: string[] = [];
    for (const it of items) {
      for (const c of it.categories || []) {
        if (!catNames.includes(c.name)) catNames.push(c.name);
      }
    }
    // build array of { category, hotel1: val, hotel2: val }
    const rows: any[] = catNames.map((cat) => {
      const row: any = { category: cat };
      for (const it of items) {
        const val = (it.categories || []).find((x: any) => x.name === cat)?.average;
        row[it.key] = val != null ? Number(val) : 0;
      }
      return row;
    });
    return rows;
  }, [allResortsQuery.data, selectedKeys]);

  return (
    <div className="min-h-screen flex flex-col gap-6 bg-gray-50 p-4">
      <div className="max-w-screen-2xl mx-auto w-full px-4">
        <h2 className="text-2xl font-semibold mb-4">Analyses & Comparaisons</h2>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-md p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Comparaison inter-hôtel (Moyenne Générale)</h3>
            {allResortsQuery.isLoading ? (
              <div className="h-64 animate-pulse bg-gray-200 rounded" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={interHotelData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} height={80} textAnchor="end" />
                    <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
                    <Tooltip />
                    <Bar dataKey="overall" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white rounded-md p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Sélectionner des hôtels à comparer (max 8)</h3>
            <div className="flex flex-wrap gap-2">
              {RESORTS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => toggleSelect(r.key)}
                  className={`px-3 py-1 rounded-md border ${selectedKeys.includes(r.key) ? "bg-primary text-white" : "bg-white"}`}
                >
                  {r.name}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {radarData.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sélectionne au moins un hôtel pour voir la comparaison par catégorie.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius={90} data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="category" />
                      <PolarRadiusAxis angle={30} domain={[0, 5]} />
                      {selectedKeys.map((k, idx) => {
                        const color = ["#3b82f6", "#06b6d4", "#ef4444", "#f59e0b", "#10b981", "#7c3aed", "#f97316", "#8b5cf6"][idx % 8];
                        return <Radar key={k} name={RESORTS.find((x) => x.key === k)?.name || k} dataKey={k} stroke={color} fill={color} fillOpacity={0.4} />;
                      })}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-md p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Alertes & Points faibles</h3>
          <p className="text-sm text-muted-foreground mb-3">Analyse automatique pour détecter les hôtels ou catégories nécessitant une attention (faible moyenne, forte variance, peu de répondants).</p>

          {/* Compute aggregated category stats */}
          {allResortsQuery.isLoading ? (
            <div className="h-32 animate-pulse bg-gray-200 rounded" />
          ) : (
            (() => {
              const rows = allResortsQuery.data || [];
              // aggregate categories
              const catMap: Record<string, { total: number; count: number; values: number[] }> = {};
              for (const r of rows) {
                if (r.error || !r.categories) continue;
                for (const c of r.categories) {
                  if (typeof c.average !== 'number') continue;
                  catMap[c.name] = catMap[c.name] || { total: 0, count: 0, values: [] };
                  catMap[c.name].total += Number(c.average);
                  catMap[c.name].count += 1;
                  catMap[c.name].values.push(Number(c.average));
                }
              }
              const catStats = Object.keys(catMap).map((name) => {
                const v = catMap[name];
                const avg = v.total / v.count;
                const mean = avg;
                const variance = v.values.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / Math.max(1, v.count);
                const std = Math.sqrt(variance);
                return { name, avg, std, count: v.count };
              });

              catStats.sort((a, b) => a.avg - b.avg);

              // hotels with low overall
              const badHotels = (rows as any[]).filter((h) => !h.error && typeof h.overall === 'number').sort((a, b) => a.overall - b.overall).slice(0, 6);

              // categories with high variance
              const highVar = catStats.filter((c) => c.std >= 0.6).sort((a, b) => b.std - a.std).slice(0, 6);

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3">
                    <div className="text-sm font-medium">Catégories les plus faibles (moyenne)</div>
                    <ul className="mt-2 space-y-2">
                      {catStats.slice(0, 6).map((c) => (
                        <li key={c.name} className="flex items-center justify-between bg-white border p-2 rounded">
                          <div className="text-sm">{c.name}</div>
                          <div className="text-sm font-semibold">{c.avg.toFixed(2)}/5</div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3">
                    <div className="text-sm font-medium">Hôtels à surveiller (moyenne générale basse)</div>
                    <ul className="mt-2 space-y-2">
                      {badHotels.map((h: any) => (
                        <li key={h.key} className="flex items-center justify-between bg-white border p-2 rounded">
                          <div className="text-sm">{h.name}</div>
                          <div className="text-sm font-semibold">{Number(h.overall).toFixed(2)}/5</div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3">
                    <div className="text-sm font-medium">Incohérences (forte variance par catégorie)</div>
                    <ul className="mt-2 space-y-2">
                      {highVar.map((c) => (
                        <li key={c.name} className="flex items-center justify-between bg-white border p-2 rounded">
                          <div className="text-sm">{c.name}</div>
                          <div className="text-sm font-semibold">σ={c.std.toFixed(2)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()
          )}
        </section>

        <section className="bg-white rounded-md p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Tendances temporelles (hôtel sélectionné)</h3>
          <p className="text-sm text-muted-foreground mb-3">La source actuelle fournit la moyenne globale actuelle et les moyennes par catégorie (instantané). Pour des tendances temporelles réelles, il faut enregistrer périodiquement ces valeurs côté serveur. En attendant, voici l'instantané actuel et la répartition par catégorie.</p>

          {isLoading || !data ? (
            <div className="w-full animate-pulse h-64 rounded-md bg-gray-200" />
          ) : isError ? (
            <div className="text-sm text-destructive">Impossible de charger les données.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-md p-4">
                <div className="text-sm text-muted-foreground">Moyenne Générale</div>
                <div className="mt-2 text-3xl font-extrabold">{data ? `${data.overallAverage.toFixed(1)}/5` : "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">Mise à jour: {data && data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : "—"}</div>
              </div>

              <div className="bg-white rounded-md p-4">
                <div className="text-sm text-muted-foreground">Répartition par catégorie</div>
                <div className="mt-2">
                  <ChartOnly data={data.categories} chartType="bar" id="chart-wrapper" />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
