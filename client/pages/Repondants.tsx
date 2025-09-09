import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import { useSelectedResort } from '@/hooks/use-selected-resort';
import Sidebar from "@/components/Sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";


function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function cellToString(c: any) {
  if (!c) return "";
  if (typeof c === "string") return c;
  if (typeof c === "number") return String(c);
  if (c.v != null) return String(c.v);
  return "";
}

function formatDateToFR(raw: string) {
  if (!raw) return '';
  let s = raw.toString().trim();

  // Normalize common non-breaking spaces and multiple spaces
  s = s.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

  // Handle Google/Sheets style Date(YYYY,M,D,H,mm,ss)
  const sheetsDate = s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})\)$/);
  if (sheetsDate) {
    const year = Number(sheetsDate[1]);
    const monthIndex = Number(sheetsDate[2]); // already 0-based in this format
    const day = Number(sheetsDate[3]);
    const dt = new Date(year, monthIndex, day);
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // If string contains a clear date part with time (e.g. '09/07/2025 09:51:37' or '09.07.2025 09:51'), extract date part first
  const dateWithTimeMatch = s.match(/^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s+/);
  if (dateWithTimeMatch) {
    const datePart = dateWithTimeMatch[1];
    const dmY = datePart.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
    if (dmY) {
      const d = dmY[1].padStart(2, '0');
      const m = dmY[2].padStart(2, '0');
      let y = dmY[3];
      if (y.length === 2) y = '20' + y;
      return `${d}/${m}/${y}`;
    }
  }

  // If already in DD/MM/YYYY or DD.MM.YYYY (no time) normalize
  const dmY = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (dmY) {
    const d = dmY[1].padStart(2, '0');
    const m = dmY[2].padStart(2, '0');
    let y = dmY[3];
    if (y.length === 2) y = '20' + y;
    return `${d}/${m}/${y}`;
  }

  // Handle French month names like '9 juillet 2025' or '9 Jul 2025'
  const months: Record<string, number> = {
    janv: 1, janvier: 1, feb: 2, févr: 2, fev: 2, fevrier: 2, mars: 3, apr: 4, avril: 4,
    mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, juillet: 7, aout: 8, août: 8, sep: 9, sept: 9, septembre: 9,
    oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, déc: 12, decembre: 12
  };
  const monthNameMatch = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ\-]+)\s+(\d{4})$/);
  if (monthNameMatch) {
    const d = String(Number(monthNameMatch[1])).padStart(2, '0');
    const rawMonth = monthNameMatch[2].toLowerCase();
    const y = monthNameMatch[3];
    // try to find a month by prefix
    let mNum = 0;
    for (const [k, v] of Object.entries(months)) {
      if (rawMonth.startsWith(k)) { mNum = v; break; }
    }
    if (mNum > 0) return `${d}/${String(mNum).padStart(2, '0')}/${y}`;
  }

  // Try ISO-like date/time or date-only strings (e.g. 2025-07-09T09:51:37 or 2025-07-09 09:51:37)
  const isoDateMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    const d = isoDateMatch[3];
    const m = isoDateMatch[2];
    const y = isoDateMatch[1];
    return `${d}/${m}/${y}`;
  }

  // Try generic Date parse and format only date part
  // Accept also 'MM/DD/YYYY' by trying both locale and strict parsing
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Try Excel serial number (days since 1899-12-30)
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000);
    const d = String(dt2.getUTCDate()).padStart(2, '0');
    const m = String(dt2.getUTCMonth() + 1).padStart(2, '0');
    const y = dt2.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  return s;
}

import { fetchJsonSafe } from '@/lib/fetcher';

// Format average numbers to one decimal and use comma as decimal separator (e.g. "3,7")

function formatAverage(raw: any) {
  if (raw == null || raw === '') return '';
  const n = Number(String(raw).replace(',', '.'));
  if (Number.isNaN(n)) return String(raw);
  // round to one decimal
  const s = n.toFixed(1);
  return s.replace('.', ',');
}

export default function Repondants() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { resort: selectedResortKey } = useSelectedResort();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(100);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["repondants", selectedResortKey, page, pageSize],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(`/api/resort/${selected}/respondents?page=${page}&pageSize=${pageSize}`, window.location.origin).toString();
        // server returns { items, total, page, pageSize }
        return await fetchJsonSafe(apiUrl, { credentials: 'same-origin' });
      } catch (err) {
        console.error('Failed to fetch respondents:', err);
        return { items: [], total: 0, page: 1, pageSize };
      }
    },
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
  });

  // fetch global summary (respondents + recommendation rate)
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['resortSummary', selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(`/api/resort/${selected}/summary`, window.location.origin).toString();
        try { return await fetchJsonSafe(apiUrl, { credentials: 'same-origin' }); } catch (err) { console.error('Unable to load summary:', err); return null; }
      } catch (err) {
        console.error('Failed to fetch summary:', err);
        return null;
      }
    },
    enabled: true,
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
  });

  // fetch averages (overallAverage)
  const { data: averages, isLoading: loadingAverages } = useQuery({
    queryKey: ['resortAverages', selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(`/api/resort/${selected}/averages`, window.location.origin).toString();
        try { return await fetchJsonSafe(apiUrl, { credentials: 'same-origin' }); } catch (err) { console.error('Unable to load averages:', err); return null; }
      } catch (err) {
        console.error('Failed to fetch averages:', err);
        return null;
      }
    },
    enabled: true,
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
  });

  // respondent details query (poll while dialog open)
  // state to hold selected respondent and per-category values
  const [selected, setSelected] = React.useState<any>(null);
  const [categoriesByRespondent, setCategoriesByRespondent] = React.useState<{ name: string; value: string }[] | null>(null);
  const [loadingRespondentData, setLoadingRespondentData] = React.useState(false);
  const [respondentNoteGeneral, setRespondentNoteGeneral] = React.useState<string | null>(null);
  const [respondentColumnLetter, setRespondentColumnLetter] = React.useState<string | null>(null);
  const [respondentFeedback, setRespondentFeedback] = React.useState<string | null>(null);

  // helper to convert 0-based index to column letter (A, B, ... Z, AA...)
  const indexToColumn = (idx: number) => {
    let col = '';
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      n = Math.floor((n - 1) / 26);
    }
    return col;
  };

  const respondentQuery = useQuery({
    queryKey: ['respondentDetails', selectedResortKey, selected?.email, selected?.name, selected?.date],
    queryFn: async () => {
      if (!selected) return null;
      const params = new URLSearchParams();
      if (selected?.email) params.set('email', selected.email);
      if (selected?.name) params.set('name', selected.name);
      if (selected?.date) params.set('date', selected.date);
      const apiUrl = new URL('/api/resort/' + selectedResortKey + '/respondent?' + params.toString(), window.location.origin).toString();
      try {
        return await fetchJsonSafe(apiUrl, { credentials: 'same-origin' });
      } catch (err: any) {
        if (err && err.status === 404) return null;
        throw new Error('Unable to load respondent details: ' + (err && err.message));
      }
    },
    enabled: !!selected && dialogOpen,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
    onSuccess: (d: any) => {
      setCategoriesByRespondent(d?.categories || null);
      setRespondentNoteGeneral(d?.overall || null);
      setRespondentColumnLetter(d?.column || null);
      setRespondentFeedback(d?.feedback || null);
    },
    onError: (err) => {
      console.error('Failed to fetch respondent details:', err);
      setCategoriesByRespondent(null);
      setRespondentNoteGeneral(null);
      setRespondentColumnLetter(null);
      setRespondentFeedback(null);
    }
  });
  // keep loading state in sync
  React.useEffect(() => { setLoadingRespondentData(Boolean(respondentQuery.isFetching)); }, [respondentQuery.isFetching]);



  // When dialog opens for a selected respondent, fetch matrice sheet and attempt to extract per-category values
  React.useEffect(() => {
    if (!dialogOpen || !selected) return;
    let mounted = true;
    (async () => {
      setLoadingRespondentData(true);
      setCategoriesByRespondent(null);
      setRespondentNoteGeneral(null);
      setRespondentColumnLetter(null);
      try {
        const params = new URLSearchParams();
        if (selected?.email) params.set('email', selected.email);
        if (selected?.name) params.set('name', selected.name);
        if (selected?.date) params.set('date', selected.date);
        const apiUrl = new URL('/api/resort/' + selectedResortKey + '/respondent?' + params.toString(), window.location.origin).toString();
        try {
          const dataResp = await fetchJsonSafe(apiUrl, { credentials: 'same-origin' });
          if (mounted) {
            setCategoriesByRespondent(dataResp.categories || null);
            setRespondentNoteGeneral(dataResp.overall || null);
            setRespondentColumnLetter(dataResp.column || null);
            setRespondentFeedback(dataResp.feedback || null);
          }
        } catch (err: any) {
          if (err && err.status === 404) {
            if (mounted) {
              setCategoriesByRespondent(null);
              setRespondentNoteGeneral(null);
              setRespondentColumnLetter(null);
              setRespondentFeedback(null);
            }
            setLoadingRespondentData(false);
            return;
          }
          throw new Error('Unable to load respondent details: ' + (err && err.message));
        }
      } catch (err) {
        console.error('Failed to fetch respondent matrice via server:', err);
        if (mounted) {
              setCategoriesByRespondent(null);
              setRespondentNoteGeneral(null);
              setRespondentColumnLetter(null);
              setRespondentFeedback(null);
            }
      } finally {
        if (mounted) setLoadingRespondentData(false);
      }
    })();
    return () => { mounted = false; };
  }, [dialogOpen, selected]);

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6">
          <h2 className="text-2xl font-semibold mb-4">Répondants</h2>

          <Card>
            <CardContent className="p-0">
              <div className="font-normal px-6 pb-6">
                {isLoading && <div>Chargement…</div>}
                {isError && <div className="text-red-600">Impossible de charger les répondants.</div>}

                {data && (
                  <div className="overflow-x-auto overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 table-auto">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Nom</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Note Général</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Âges</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Code postal</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Durée du voyage</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {(data.items || []).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600">{row.name || row.label || row.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{row.note ? formatAverage(row.note) : '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDateToFR(row.date)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{row.age || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{row.postal}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{row.duration}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <button onClick={() => { setSelected(row); setDialogOpen(true); }} className="inline-flex items-center gap-2 rounded-full border p-2 hover:bg-gray-100">
                                <Eye className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm text-muted-foreground">Affichage {((data.page-1)*data.pageSize)+1} - {Math.min(data.total, data.page*data.pageSize)} sur {data.total}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPage(Math.max(1, page-1))} disabled={page<=1} className="px-3 py-1 border rounded">Préc</button>
                        <div className="text-sm">Page {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</div>
                        <button onClick={() => setPage(Math.min(Math.max(1, Math.ceil(data.total/data.pageSize)), page+1))} disabled={page>=Math.ceil(data.total/data.pageSize)} className="px-3 py-1 border rounded">Suiv</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto" aria-describedby="respondent-dialog-desc">
              <DialogTitle>{selected?.name ? selected.name : 'Anonyme'}</DialogTitle>
              <DialogDescription id="respondent-dialog-desc">Détails et moyennes pour le répondant sélectionné</DialogDescription>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Note Général</div>
                  <div className="mt-2 text-2xl font-extrabold">{loadingRespondentData ? '…' : respondentNoteGeneral ? `${formatAverage(respondentNoteGeneral)}/5` : '—'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{respondentColumnLetter ? `Colonne ${respondentColumnLetter} de la fiche matrice (correspondant au répondant)` : 'Colonne L de la fiche matrice (correspondant au répondant) / 5'}</div>
                </div>

                <div className="md:col-span-2 rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Votre avis</div>
                  <div className="mt-2 text-sm whitespace-pre-line">{loadingRespondentData ? '…' : respondentFeedback ? respondentFeedback : '—'}</div>
                </div>

                <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Moyennes par catégorie (répondant)</div>
                  <div className="mt-2 text-sm">
                    {loadingRespondentData && <div>Chargement…</div>}
                    {!loadingRespondentData && categoriesByRespondent && categoriesByRespondent.length === 0 && <div className="text-sm text-muted-foreground">Aucune donnée de catégories trouv��e pour ce répondant.</div>}
                    {!loadingRespondentData && categoriesByRespondent && categoriesByRespondent.length > 0 && (
                      <div className="space-y-2 max-h-72 overflow-auto">
                        {categoriesByRespondent.map((c, idx) => (
                          <div key={idx} className="flex justify-between items-center px-2 py-1 border-b last:border-b-0">
                            <div className="text-sm text-gray-700">{c.name}</div>
                            <div className="text-sm font-medium text-gray-900">{c.value ? formatAverage(c.value) : '—'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!loadingRespondentData && categoriesByRespondent === null && (
                      <div className="text-sm text-muted-foreground">Impossible de déterminer les moyennes par catégorie pour ce répondant.</div>
                    )}
                  </div>
                </div>
              </div>


            </DialogContent>
          </Dialog>

        </main>
      </div>
    </div>
  );
}
