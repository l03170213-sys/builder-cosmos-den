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
        const url = `/api/resort/${selected}/averages`;
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r.clone().text().catch(() => "");
        if (r.ok) {
          try {
            return JSON.parse(text) as ResortAveragesResponse;
          } catch (e) {
            console.warn("resort averages invalid json", e, text);
            return null;
          }
        }

        // Server returned non-ok (likely unknown resort). Try client-side sheets fallback for locally added resorts.
        try {
          const cfg = resorts.find((rr) => rr.key === selectedResortKey);
          if (cfg && (cfg as any).sheetId) {
            const mod = await import("@/lib/sheets");
            const json = await mod.fetchAveragesFromSheet((cfg as any).sheetId, (cfg as any).gidMatrice);
            return { resort: selectedResortKey, updatedAt: json.updatedAt, overallAverage: json.overallAverage, categories: json.categories } as any;
          }
        } catch (e) {
          console.warn("Client-side fallback for averages failed", e);
        }

        console.warn("resort averages fetch returned non-ok", r.status, text);
        return null;
      } catch (err: any) {
        console.warn("resort averages fetch failed", err && err.message ? err.message : err);
        // Try client-side fallback as last resort
        try {
          const cfg = resorts.find((rr) => rr.key === selectedResortKey);
          if (cfg && (cfg as any).sheetId) {
            const mod = await import("@/lib/sheets");
            const json = await mod.fetchAveragesFromSheet((cfg as any).sheetId, (cfg as any).gidMatrice);
            return { resort: selectedResortKey, updatedAt: json.updatedAt, overallAverage: json.overallAverage, categories: json.categories } as any;
          }
        } catch (e) {
          // ignore
        }
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
        // try server API first
        try {
          const apiUrl = `/api/resort/${r.key}/averages`;
          const resp = await safeFetch(apiUrl, { credentials: 'same-origin' });
          if (resp.ok) {
            const text = await resp.clone().text().catch(() => "");
            try {
              const json = JSON.parse(text);
              return { key: r.key, name: r.name, overall: json.overallAverage, categories: json.categories };
            } catch (e) {
              console.warn('allResortsQuery: invalid json from api for', r.key, e);
            }
          } else {
            console.debug('allResortsQuery: api returned', resp.status, 'for', r.key);
          }
        } catch (e) {
          console.warn('allResortsQuery: api fetch failed for', r.key, e && (e as any).message ? (e as any).message : e);
        }

        // fallback to client-side sheets
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
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>(() => [resorts[0]?.key].filter(Boolean));
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
        const url = `/api/resort/${modalResortKey}/averages`;
        const r = await safeFetch(url, { credentials: "same-origin" });
        const text = await r.clone().text().catch(() => "");
        if (r.ok) {
          try {
            return JSON.parse(text) as ResortAveragesResponse;
          } catch (e) {
            console.warn("modal resort invalid json", e, text);
            return null;
          }
        }

        // server returned non-ok -> attempt client-side sheet fetch for this resort
        try {
          const cfg = resorts.find((rr) => rr.key === modalResortKey);
          if (cfg && (cfg as any).sheetId) {
            const mod = await import("@/lib/sheets");
            const json = await mod.fetchAveragesFromSheet((cfg as any).sheetId, (cfg as any).gidMatrice);
            return { resort: modalResortKey, updatedAt: json.updatedAt, overallAverage: json.overallAverage, categories: json.categories } as any;
          }
        } catch (e) {
          console.warn("modal client-side fallback failed", e);
        }

        console.warn("modal resort fetch non-ok", r.status, text);
        return null;
      } catch (err: any) {
        console.warn("modal resort fetch failed", err && err.message ? err.message : err);
        // try client-side fallback
        try {
          const cfg = resorts.find((rr) => rr.key === modalResortKey);
          if (cfg && (cfg as any).sheetId) {
            const mod = await import("@/lib/sheets");
            const json = await mod.fetchAveragesFromSheet((cfg as any).sheetId, (cfg as any).gidMatrice);
            return { resort: modalResortKey, updatedAt: json.updatedAt, overallAverage: json.overallAverage, categories: json.categories } as any;
          }
        } catch (e) {
          // ignore
        }
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

  // Category table controls
  const [categoryFilter, setCategoryFilter] = React.useState<string>("");
  const [categorySortBy, setCategorySortBy] = React.useState<'avg'|'std'|'count'|'name'>('avg');
  const [categorySortDir, setCategorySortDir] = React.useState<'desc'|'asc'>('desc');
  const [categoryMin, setCategoryMin] = React.useState<string>('');
  const [categoryMax, setCategoryMax] = React.useState<string>('');

  const toggleSort = (col: 'avg'|'std'|'count'|'name') => {
    if (categorySortBy === col) {
      setCategorySortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setCategorySortBy(col);
      setCategorySortDir('desc');
    }
  };

  const categoryRows = React.useMemo(() => {
    const rows = (analysis.catStats || []).slice();
    const q = (categoryFilter || '').toString().trim().toLowerCase();
    let filtered = q ? rows.filter(r => (r.name || '').toString().toLowerCase().includes(q)) : rows;

    const min = parseFloat(categoryMin as any);
    const max = parseFloat(categoryMax as any);
    if (!isNaN(min)) filtered = filtered.filter((r: any) => r.avg == null ? false : Number(r.avg) >= min);
    if (!isNaN(max)) filtered = filtered.filter((r: any) => r.avg == null ? false : Number(r.avg) <= max);

    filtered.sort((a: any, b: any) => {
      let va: any = a[categorySortBy];
      let vb: any = b[categorySortBy];
      if (categorySortBy === 'name') { va = (a.name||'').toString().toLowerCase(); vb = (b.name||'').toString().toLowerCase(); }
      if (va == null) va = 0; if (vb == null) vb = 0;
      if (va < vb) return categorySortDir === 'asc' ? -1 : 1;
      if (va > vb) return categorySortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [analysis.catStats, categoryFilter, categorySortBy, categorySortDir, categoryMin, categoryMax]);

  const exportCategoryCsv = React.useCallback(() => {
    const header = ['Catégorie','Moyenne','Meilleur hôtel', ...resorts.map(r => r.name)];
    const lines = [header.join(',')];
    for (const stat of categoryRows) {
      const best = (stat.hotels || []).slice().sort((x: any, y: any) => y.val - x.val)[0];
      const safeName = (stat.name || '').toString().replace(/"/g, '""');
      const bestLabel = best ? (best.name + ' (' + Number(best.val).toFixed(2) + ')') : '';
      const base = ['"' + safeName + '"', stat.avg != null ? Number(stat.avg).toFixed(2) : '', '"' + (bestLabel.replace(/"/g,'""')) + '"'];
      const cols = resorts.map(r => {
        const f = (stat.hotels || []).find((h: any) => h.key === r.key);
        return f ? Number(f.val).toFixed(2) : '';
      });
      lines.push(base.concat(cols).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'comparaison_categories.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [categoryRows, resorts]);

  const exportCategoryJson = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(categoryRows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'comparaison_categories.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [categoryRows]);

  const exportCategoryExcel = React.useCallback(() => {
    // Build HTML table and download as .xls (widely supported by Excel)
    const headerCols = ['Catégorie','Moyenne','Meilleur hôtel', ...resorts.map(r=>r.name)];
    const rowsHtml = categoryRows.map((stat:any) => {
      const best = (stat.hotels || []).slice().sort((x:any,y:any)=>y.val-x.val)[0];
      const cols = resorts.map((r)=>{
        const f = (stat.hotels || []).find((h:any)=>h.key===r.key);
        return `<td>${f?Number(f.val).toFixed(2):''}</td>`;
      }).join('');
      return `<tr><td>${stat.name}</td><td>${stat.avg!=null?Number(stat.avg).toFixed(2):''}</td><td>${best?best.name+' ('+Number(best.val).toFixed(2)+')':''}</td>${cols}</tr>`;
    }).join('');
    const tableHtml = `<table><thead><tr>${headerCols.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'comparaison_categories.xls'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [categoryRows, resorts]);

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
                {resorts.map((r) => (
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
                          return <Radar key={k} name={resorts.find((x) => x.key === k)?.name || k} dataKey={k} stroke={color} fill={color} fillOpacity={0.4} />;
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

          <section className="bg-white rounded-md p-4 shadow-sm mt-6">
            <h3 className="text-lg font-semibold mb-3">Comparaison par catégorie (tous les hôtels)</h3>
            <div className="text-sm text-muted-foreground mb-3">Tableau comparatif des moyennes par catégorie pour chaque hôtel.</div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Rechercher</label>
                <input
                  id="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Nom de la catégorie..."
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Filtre moyenne</label>
                <input value={categoryMin} onChange={(e)=>setCategoryMin(e.target.value)} placeholder="min" className="border rounded px-2 py-1 text-sm w-20" />
                <input value={categoryMax} onChange={(e)=>setCategoryMax(e.target.value)} placeholder="max" className="border rounded px-2 py-1 text-sm w-20" />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Trier par</label>
                <select id="category-sort" value={categorySortBy} onChange={(e) => setCategorySortBy(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
                  <option value="avg">Moyenne</option>
                  <option value="std">Écart-type</option>
                  <option value="count">Nombre d'hôtels</option>
                  <option value="name">Nom</option>
                </select>

                <select id="category-sort-dir" value={categorySortDir} onChange={(e) => setCategorySortDir(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button onClick={exportCategoryCsv} className="px-3 py-1 rounded-md border text-sm">Exporter CSV</button>
                <button onClick={exportCategoryJson} className="px-3 py-1 rounded-md border text-sm">Exporter JSON</button>
                <button onClick={exportCategoryExcel} className="px-3 py-1 rounded-md border text-sm">Exporter Excel</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left">
                    <th onClick={()=>toggleSort('name')} className="p-2 w-64 cursor-pointer">Catégorie {categorySortBy==='name' ? (categorySortDir==='desc' ? '↓' : '↑') : ''}</th>
                    <th onClick={()=>toggleSort('avg')} className="p-2 w-24 cursor-pointer">Moyenne {categorySortBy==='avg' ? (categorySortDir==='desc' ? '↓' : '↑') : ''}</th>
                    <th className="p-2 w-48">Meilleur hôtel</th>
                    {resorts.map((r) => (
                      <th key={r.key} className="p-2 text-center">{r.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((stat: any) => {
                    const best = (stat.hotels || []).slice().sort((a: any, b: any) => b.val - a.val)[0];
                    return (
                      <tr key={stat.name} className="border-t">
                        <td className="p-2 align-top">{stat.name}</td>
                        <td className="p-2 font-semibold">{stat.avg != null ? Number(stat.avg).toFixed(2) : '—'}</td>
                        <td className="p-2">{best ? `${best.name} (${Number(best.val).toFixed(2)})` : '—'}</td>
                        {resorts.map((r) => {
                          const found = (stat.hotels || []).find((h: any) => h.key === r.key);
                          return <td key={r.key} className="p-2 text-center">{found ? Number(found.val).toFixed(2) : '—'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); setModalOpen(open); }}>
            <DialogContent>
              <DialogTitle>{resorts.find(r => r.key === modalResortKey)?.name || 'Hôtel'}</DialogTitle>
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
