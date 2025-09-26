import React from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChartOnly from "@/components/ChartOnly";
import { useQuery } from "@tanstack/react-query";
import type { ResortAveragesResponse } from "@shared/api";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import useResorts from "@/hooks/use-resorts";
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
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export default function Analyses() {
  const { resort: selectedResortKey, setSelected } = useSelectedResort();
  const resorts = useResorts();
  const currentResort = resorts.find((r) => r.key === selectedResortKey) || resorts[0];

  const { data, isLoading, isError } = useQuery<ResortAveragesResponse | null>({
    queryKey: ["resort-averages-analyses", selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const url = new URL(`/api/resort/${selected}/averages`, window.location.origin).toString();
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r.clone().text().catch(() => "");
        if (!r.ok) {
          console.warn("resort averages fetch returned non-ok", r.status, text);
          return null;
        }
        try {
          return JSON.parse(text) as ResortAveragesResponse;
        } catch (e) {
          console.warn("resort averages invalid json", e, text);
          return null;
        }
      } catch (err: any) {
        console.warn("resort averages fetch failed", err && err.message ? err.message : err);
        return null;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const allResortsQuery = useQuery({
    queryKey: ["all-resorts-averages"],
    queryFn: async () => {
      const resortsList = resorts; // use the hook result captured in component scope
      const promises = resortsList.map(async (r) => {
        try {
          const mod = await import("@/lib/sheets");
          const json = await mod.fetchAveragesFromSheet(r.sheetId, (r as any).gidMatrice);
          return { key: r.key, name: r.name, overall: json.overallAverage, categories: json.categories };
        } catch (e) {
          console.warn("allResortsQuery: client fetch failed for", r.key, e && (e as any).message ? (e as any).message : e);
          return { key: r.key, name: r.name, error: true };
        }
      });
      return Promise.all(promises);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // radar selection state
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>(() => [getResorts()[0]?.key].filter(Boolean));
  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev.slice(0, 8), key]));
  };

  // modal for viewing a single hotel's chart
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalResortKey, setModalResortKey] = React.useState<string | null>(null);
  const openModal = (key: string) => {
    setModalResortKey(key);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalResortKey(null);
  };

  const modalQuery = useQuery<ResortAveragesResponse | null>({
    queryKey: ["resort-modal", modalResortKey],
    queryFn: async () => {
      try {
        if (!modalResortKey) return null;
        const url = new URL(`/api/resort/${modalResortKey}/averages`, window.location.origin).toString();
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r.clone().text().catch(() => "");
        if (!r.ok) {
          console.warn("modal resort fetch non-ok", r.status, text);
          return null;
        }
        try {
          return JSON.parse(text) as ResortAveragesResponse;
        } catch (e) {
          console.warn("modal resort invalid json", e, text);
          return null;
        }
      } catch (err: any) {
        console.warn("modal resort fetch failed", err && err.message ? err.message : err);
        return null;
      }
    },
    enabled: !!modalResortKey && modalOpen,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const interHotelData = (allResortsQuery.data || [])
    .filter((r: any) => !r.error && typeof r.overall === "number")
    .map((r: any) => ({ name: r.name, overall: Number(r.overall) }));

  const radarData = React.useMemo(() => {
    const items = (allResortsQuery.data || []).filter((r: any) => selectedKeys.includes(r.key) && !r.error);
    if (items.length === 0) return [];
    const catNames: string[] = [];
    for (const it of items) {
      for (const c of it.categories || []) {
        if (!catNames.includes(c.name)) catNames.push(c.name);
      }
    }
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

  // Derived analysis: category stats, weak hotels, high variance categories
  const analysis = React.useMemo(() => {
    const rows = allResortsQuery.data || [];
    const catMap: Record<string, { total: number; count: number; values: number[]; hotels: { key: string; name: string; val: number }[] }> = {};
    const hotels: any[] = [];
    for (const r of rows) {
      if (r.error) continue;
      hotels.push({ key: r.key, name: r.name, overall: r.overall, categories: r.categories });
      for (const c of r.categories || []) {
        if (typeof c.average !== "number") continue;
        catMap[c.name] = catMap[c.name] || { total: 0, count: 0, values: [], hotels: [] };
        catMap[c.name].total += Number(c.average);
        catMap[c.name].count += 1;
        catMap[c.name].values.push(Number(c.average));
        catMap[c.name].hotels.push({ key: r.key, name: r.name, val: Number(c.average) });
      }
    }
    const catStats = Object.keys(catMap)
      .map((name) => {
        const v = catMap[name];
        const avg = v.total / v.count;
        const mean = avg;
        const variance = v.values.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / Math.max(1, v.count);
        const std = Math.sqrt(variance);
        return { name, avg, std, count: v.count, hotels: v.hotels };
      })
      .sort((a, b) => a.avg - b.avg);

    const badHotels = hotels.filter((h) => typeof h.overall === "number").sort((a, b) => a.overall - b.overall);
    const goodHotels = [...badHotels].slice().reverse();
    const highVar = catStats.filter((c) => c.std >= 0.6).sort((a, b) => b.std - a.std);

    return { catStats, badHotels, goodHotels, highVar };
  }, [allResortsQuery.data]);

  const bestHotel = (analysis.goodHotels && analysis.goodHotels[0]) || null;
  const worstHotel = (analysis.badHotels && analysis.badHotels[0]) || null;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
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
                {useResorts().map((r) => (
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
                          return <Radar key={k} name={useResorts().find((x) => x.key === k)?.name || k} dataKey={k} stroke={color} fill={color} fillOpacity={0.4} />;
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white border p-3 rounded flex flex-col justify-between">
                <div className="text-sm text-muted-foreground">Meilleur hôtel</div>
                {bestHotel ? (
                  <>
                    <div className="mt-2 text-lg font-semibold">{bestHotel.name}</div>
                    <div className="mt-1 text-sm">Moyenne: {Number(bestHotel.overall).toFixed(2)}/5</div>
                    <div className="mt-3">
                      <button
                        onClick={() => openModal(bestHotel.key)}
                        className="px-3 py-1 rounded-md bg-primary text-white text-sm"
                      >Voir</button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm">Aucun donnée</div>
                )}
              </div>

              <div className="bg-white border p-3 rounded flex flex-col justify-between">
                <div className="text-sm text-muted-foreground">Pire hôtel</div>
                {worstHotel ? (
                  <>
                    <div className="mt-2 text-lg font-semibold">{worstHotel.name}</div>
                    <div className="mt-1 text-sm">Moyenne: {Number(worstHotel.overall).toFixed(2)}/5</div>
                    <div className="mt-3">
                      <button
                        onClick={() => openModal(worstHotel.key)}
                        className="px-3 py-1 rounded-md border text-sm"
                      >Voir</button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm">Aucun donnée</div>
                )}
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-md p-3">
                <div className="text-sm font-medium">Hôtels à surveiller (moyenne générale basse)</div>
                <ul className="mt-2 space-y-2">
                  {analysis.badHotels.slice(0, 6).map((h: any) => (
                    <li key={h.key} className="flex items-center justify-between bg-white border p-2 rounded">
                      <div className="text-sm">{h.name}</div>
                      <div className="text-sm font-semibold">{Number(h.overall).toFixed(2)}/5</div>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </section>

          <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); setModalOpen(open); }}>
            <DialogContent>
              <DialogTitle>{useResorts().find(r => r.key === modalResortKey)?.name || 'Hôtel'}</DialogTitle>
              <DialogDescription>
                {modalQuery.isLoading ? (
                  <div className="h-64 animate-pulse bg-gray-200 rounded" />
                ) : modalQuery.isError ? (
                  <div className="text-sm text-destructive">Impossible de charger les données.</div>
                ) : modalQuery.data ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">Moyenne Générale</div>
                    <div className="text-3xl font-extrabold">{modalQuery.data ? `${modalQuery.data.overallAverage.toFixed(1)}/5` : '—'}</div>
                    <div className="mt-2">
                      <ChartOnly data={modalQuery.data.categories} chartType="bar" id="modal-hotel-chart" />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Aucune donnée.</div>
                )}
              </DialogDescription>
            </DialogContent>
          </Dialog>

        </main>
      </div>
    </div>
  );
}
