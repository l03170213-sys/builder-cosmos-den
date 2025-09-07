import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const SHEET_ID = "1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os";

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
  const s = raw.toString().trim();

  // Handle Google/Sheets style Date(YYYY,M,D,H,mm,ss)
  const sheetsDate = s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})\)$/);
  if (sheetsDate) {
    const year = Number(sheetsDate[1]);
    const monthIndex = Number(sheetsDate[2]); // already 0-based in this format
    const day = Number(sheetsDate[3]);
    // create Date using local timezone
    const dt = new Date(year, monthIndex, day);
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // If string contains a clear date part with time (e.g. '09/07/2025 09:51:37'), extract date part first
  const dateWithTimeMatch = s.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+/);
  if (dateWithTimeMatch) {
    const datePart = dateWithTimeMatch[1];
    // normalize day/month/year
    const dmY = datePart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmY) {
      const d = dmY[1].padStart(2, '0');
      const m = dmY[2].padStart(2, '0');
      let y = dmY[3];
      if (y.length === 2) y = '20' + y;
      return `${d}/${m}/${y}`;
    }
  }

  // If already in DD/MM/YYYY (no time) normalize
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY) {
    const d = dmY[1].padStart(2, '0');
    const m = dmY[2].padStart(2, '0');
    let y = dmY[3];
    if (y.length === 2) y = '20' + y;
    return `${d}/${m}/${y}`;
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

export default function Repondants() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["repondants"],
    queryFn: async () => {
      try {
        // Fetch from internal server endpoint only (avoid client-side Google fetch/CORS)
        const apiUrl = new URL('/api/resort/vm-resort-albanie/respondents', window.location.origin).toString();
        const r = await fetch(apiUrl, { credentials: 'same-origin' });
        if (!r.ok) {
          console.error('Unable to load respondents from server, status', r.status);
          return [];
        }
        return await r.json();

        const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
        const gurlResp = await fetch(gurl);
        if (!gurlResp.ok) {
          console.error('Unable to fetch sheet, status', gurlResp.status);
          return [];
        }
        const text = await gurlResp.text();
        const parsed = parseGviz(text);
        const cols: string[] = (parsed.table.cols || []).map((c: any) => (c.label || '').toString().toLowerCase());
        const rows: any[] = parsed.table.rows || [];

        // Determine likely column indices
        const idxName = cols.findIndex((c) => c.includes('nom') || c.includes('name'));
        const idxEmail = cols.findIndex((c) => c.includes('mail') || c.includes('email'));
        // Use column L (index 11) for Note if present in sheet1, but we'll overwrite using matrice moyenne when possible
        const idxNote = (cols[11] != null && cols[11] !== '') ? 11 : cols.findIndex((c) => c.includes('note') || c.includes('rating'));
        // Date: prefer 'submitted at' or 'timestamp' or any 'date'
        let idxDate = cols.findIndex((c) => c.includes('submitted at') || c.includes('submitted') || c.includes('timestamp'));
        if (idxDate === -1) idxDate = cols.findIndex((c) => c.includes('date'));
        // Postal code, duration and feedback columns
        const idxPostal = cols.findIndex((c) => c.includes('postal') || c.includes('code postal') || c.includes('zipcode') || c.includes('zip'));
        const idxDuration = cols.findIndex((c) => c.includes('dur') || c.includes('duree') || c.includes('durée') || c.includes('duration'));
        const idxFeedback = cols.findIndex((c) => c.includes('votre avis') || c.includes("votre avis compte") || c.includes('commentaire') || c.includes('feedback') || c.includes('votre avis'));

        let items = rows
          .map((rrow: any) => {
            const c = rrow.c || [];
            return {
              name: cellToString(c[idxName]) || cellToString(c[0]) || '',
              email: cellToString(c[idxEmail]) || '',
              note: cellToString(c[idxNote]) || '',
              date: cellToString(c[idxDate]) || '',
              postal: cellToString(c[idxPostal]) || '',
              duration: cellToString(c[idxDuration]) || '',
              feedback: cellToString(c[idxFeedback]) || '',
            };
          })
          .filter((it) => it.email || it.note || it.date || it.postal || it.duration || it.feedback);

        // Try to augment notes using matrice moyenne (prefer this source for the respondent's Note)
        try {
          const GID_MATRICE_MOYENNE = '1595451985';
          const mgurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
          const mr = await fetch(mgurl);
          if (mr.ok) {
            const mtext = await mr.text();
            const start = mtext.indexOf('(');
            const end = mtext.lastIndexOf(')');
            const mjson = JSON.parse(mtext.slice(start + 1, end));
            const mcols: string[] = (mjson.table.cols || []).map((c: any) => (c.label || '').toString());
            const mrows: any[] = mjson.table.rows || [];

            const lastRow = mrows[mrows.length - 1];

            const getNoteFromMatrice = (resp: any) => {
            if (!mrows || mrows.length === 0) return null;
            const targetEmail = resp.email ? String(resp.email).trim().toLowerCase() : '';
            const targetName = resp.name ? String(resp.name).trim().toLowerCase() : '';
            const targetDate = formatDateToFR(resp.date || '');

            // Scenario A: rows are respondents, first cell is identifier. There may be multiple matches; try to disambiguate by date.
            const candidateRowIdxs: number[] = [];
            for (let i = 0; i < mrows.length; i++) {
              const r = mrows[i];
              const c = r.c || [];
              const first = c[0] && c[0].v != null ? String(c[0].v).trim().toLowerCase() : '';
              if (!first) continue;
              if (first === targetEmail || first === targetName) candidateRowIdxs.push(i);
            }
            if (candidateRowIdxs.length === 1) {
              const row = mrows[candidateRowIdxs[0]];
              const cells = row.c || [];
              const overallCell = cells[mcols.length - 1];
              return cellToString(overallCell) || null;
            }
            if (candidateRowIdxs.length > 1) {
              // try to find matching date within the candidate rows (any cell matching date)
              for (const idx of candidateRowIdxs) {
                const row = mrows[idx];
                const cells = row.c || [];
                const foundDate = cells.some((cell: any) => formatDateToFR(cellToString(cell)) === targetDate && targetDate !== '');
                if (foundDate) {
                  const overallCell = row.c && row.c[mcols.length - 1];
                  return cellToString(overallCell) || null;
                }
              }
              // fallback to first candidate
              const row = mrows[candidateRowIdxs[0]];
              const overallCell = row.c && row.c[mcols.length - 1];
              return cellToString(overallCell) || null;
            }

            // Scenario B: cols are respondents. find column index matching respondent header
            // collect candidate columns that match email/name
            const candidateCols: number[] = [];
            for (let i = 0; i < mcols.length; i++) {
              const lbl = (mcols[i] || '').toString().trim().toLowerCase();
              if (!lbl) continue;
              if (lbl === targetEmail || lbl === targetName) { candidateCols.push(i); continue; }
              if (targetEmail && lbl.includes(targetEmail)) { candidateCols.push(i); continue; }
              if (targetName && lbl.includes(targetName)) { candidateCols.push(i); continue; }
            }

            let chosenCol = -1;
            if (candidateCols.length === 1) chosenCol = candidateCols[0];
            else if (candidateCols.length > 1) {
              // try to disambiguate using date present in header
              for (const ci of candidateCols) {
                const lbl = (mcols[ci] || '').toString();
                if (formatDateToFR(lbl).replace(/\s/g, '') === targetDate.replace(/\s/g, '')) { chosenCol = ci; break; }
                if (lbl.includes(targetDate)) { chosenCol = ci; break; }
              }
              // if still not chosen, try prefer column L (index 11) if within candidates
              if (chosenCol === -1 && candidateCols.includes(11)) chosenCol = 11;
              // else pick first
              if (chosenCol === -1) chosenCol = candidateCols[0];
            }

            if (chosenCol !== -1 && lastRow) {
              const valCell = lastRow.c && lastRow.c[chosenCol];
              return cellToString(valCell) || null;
            }

            return null;
          };

            items = items.map((it) => {
              const fromM = getNoteFromMatrice(it);
              if (fromM) return { ...it, note: fromM };
              return it;
            });
          }
        } catch (err) {
          // ignore matrice errors
          console.error('Failed to augment notes from matrice:', err);
        }

        return items;
      } catch (err) {
        console.error('Failed to fetch respondents:', err);
        return [];
      }
    },
    refetchOnWindowFocus: false,
  });

  // fetch global summary (respondents + recommendation rate)
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['resortSummary'],
    queryFn: async () => {
      try {
        const r = await fetch('/api/resort/vm-resort-albanie/summary');
        if (!r.ok) {
          console.error('Unable to load summary, status', r.status);
          return null;
        }
        return r.json();
      } catch (err) {
        console.error('Failed to fetch summary:', err);
        return null;
      }
    },
    enabled: true,
    refetchOnWindowFocus: false,
  });

  // fetch averages (overallAverage)
  const { data: averages, isLoading: loadingAverages } = useQuery({
    queryKey: ['resortAverages'],
    queryFn: async () => {
      try {
        const r = await fetch('/api/resort/vm-resort-albanie/averages');
        if (!r.ok) {
          console.error('Unable to load averages, status', r.status);
          return null;
        }
        return r.json();
      } catch (err) {
        console.error('Failed to fetch averages:', err);
        return null;
      }
    },
    enabled: true,
    refetchOnWindowFocus: false,
  });

  // state to hold selected respondent and per-category values
  const [selected, setSelected] = React.useState<any>(null);
  const [categoriesByRespondent, setCategoriesByRespondent] = React.useState<{ name: string; value: string }[] | null>(null);
  const [loadingRespondentData, setLoadingRespondentData] = React.useState(false);
  const [respondentNoteGeneral, setRespondentNoteGeneral] = React.useState<string | null>(null);
  const [respondentColumnLetter, setRespondentColumnLetter] = React.useState<string | null>(null);

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
        const url = `/api/resort/vm-resort-albanie/respondent?${params.toString()}`;
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) {
          if (r.status === 404) {
            if (mounted) {
              setCategoriesByRespondent(null);
              setRespondentNoteGeneral(null);
              setRespondentColumnLetter(null);
            }
            setLoadingRespondentData(false);
            return;
          }
          throw new Error('Unable to load respondent details');
        }
        const dataResp = await r.json();
        if (mounted) {
          setCategoriesByRespondent(dataResp.categories || null);
          setRespondentNoteGeneral(dataResp.overall || null);
          setRespondentColumnLetter(dataResp.column || null);
        }
      } catch (err) {
        console.error('Failed to fetch respondent matrice via server:', err);
        if (mounted) {
          setCategoriesByRespondent(null);
          setRespondentNoteGeneral(null);
          setRespondentColumnLetter(null);
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
            <CardHeader>
              <CardTitle>Liste des Répondants ({isLoading ? '…' : data?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && <div>Chargement…</div>}
              {isError && <div className="text-red-600">Impossible de charger les répondants.</div>}

              {data && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 table-auto">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Note Général</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Âges</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Code postal</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Durée du voyage</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {data.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">{row.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.note}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDateToFR(row.date)}</td>
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
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-3xl" aria-describedby="respondent-dialog-desc">
              <DialogTitle>{selected?.name ? selected.name : 'Anonyme'}</DialogTitle>
              <DialogDescription id="respondent-dialog-desc">Détails et moyennes pour le répondant sélectionné</DialogDescription>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Note Général</div>
                  <div className="mt-2 text-2xl font-extrabold">{loadingRespondentData ? '…' : respondentNoteGeneral ? `${respondentNoteGeneral}/5` : '—'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{respondentColumnLetter ? `Colonne ${respondentColumnLetter} de la fiche matrice (correspondant au répondant)` : 'Colonne L de la fiche matrice (correspondant au répondant) / 5'}</div>
                </div>

                <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Moyennes par catégorie (répondant)</div>
                  <div className="mt-2 text-sm">
                    {loadingRespondentData && <div>Chargement…</div>}
                    {!loadingRespondentData && categoriesByRespondent && categoriesByRespondent.length === 0 && <div className="text-sm text-muted-foreground">Aucune donnée de catégories trouvée pour ce répondant.</div>}
                    {!loadingRespondentData && categoriesByRespondent && categoriesByRespondent.length > 0 && (
                      <div className="space-y-2 max-h-72 overflow-auto">
                        {categoriesByRespondent.map((c, idx) => (
                          <div key={idx} className="flex justify-between items-center px-2 py-1 border-b last:border-b-0">
                            <div className="text-sm text-gray-700">{c.name}</div>
                            <div className="text-sm font-medium text-gray-900">{c.value}</div>
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

              <div className="mt-4">
                <div className="rounded-lg border p-4 bg-white" style={{ borderColor: '#e6edf3' }}>
                  <div className="text-xs text-muted-foreground">Votre avis compte pour nous ! :)</div>
                  <div className="mt-2 text-sm">
                    {selected && (selected.feedback ? <div className="whitespace-pre-wrap text-sm text-gray-800">{selected.feedback}</div> : <div className="text-sm text-muted-foreground">Aucun commentaire fourni.</div>)}
                    {!selected && <div className="text-sm text-muted-foreground">Sélectionnez un répondant pour voir le commentaire.</div>}
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
