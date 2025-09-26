import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import { loadSettings, saveSettings } from "@/lib/settings";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import Sidebar from "@/components/Sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import useResorts from "@/hooks/use-resorts";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  if (!raw) return "";
  let s = raw.toString().trim();

  // Normalize common non-breaking spaces and multiple spaces
  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Handle Google/Sheets style Date(YYYY,M,D,...) — accept both Date(Y,M,D) and Date(Y,M,D,H,mm,ss)
  const sheetsDate = s.match(/^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*)?\)$/);
  if (sheetsDate) {
    const year = Number(sheetsDate[1]);
    const monthIndex = Number(sheetsDate[2]); // Google Sheets Date month is 0-based in this representation
    const day = Number(sheetsDate[3]);
    const dt = new Date(year, monthIndex, day);
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // If string contains a clear date part with time (e.g. '09/07/2025 09:51:37' or '09.07.2025 09:51'), extract date part first
  const dateWithTimeMatch = s.match(
    /^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s+/,
  );
  if (dateWithTimeMatch) {
    const datePart = dateWithTimeMatch[1];
    const dmY = datePart.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
    if (dmY) {
      const d = dmY[1].padStart(2, "0");
      const m = dmY[2].padStart(2, "0");
      let y = dmY[3];
      if (y.length === 2) y = "20" + y;
      return `${d}/${m}/${y}`;
    }
  }

  // If already in DD/MM/YYYY or DD.MM.YYYY (no time) normalize
  const dmY = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (dmY) {
    const d = dmY[1].padStart(2, "0");
    const m = dmY[2].padStart(2, "0");
    let y = dmY[3];
    if (y.length === 2) y = "20" + y;
    return `${d}/${m}/${y}`;
  }

  // Handle French month names like '9 juillet 2025' or '9 Jul 2025'
  const months: Record<string, number> = {
    janv: 1,
    janvier: 1,
    feb: 2,
    févr: 2,
    fev: 2,
    fevrier: 2,
    mars: 3,
    apr: 4,
    avril: 4,
    mai: 5,
    jun: 6,
    juin: 6,
    jul: 7,
    juil: 7,
    juillet: 7,
    aout: 8,
    août: 8,
    sep: 9,
    sept: 9,
    septembre: 9,
    oct: 10,
    octobre: 10,
    nov: 11,
    novembre: 11,
    dec: 12,
    déc: 12,
    decembre: 12,
  };
  // Use Unicode property for letters to safely match accented month names
  const monthNameMatch = s.match(/^(\d{1,2})\s+([\p{L}\-]+)\s+(\d{4})$/u);
  if (monthNameMatch) {
    const d = String(Number(monthNameMatch[1])).padStart(2, "0");
    const rawMonth = monthNameMatch[2].toLowerCase();
    const y = monthNameMatch[3];
    // try to find a month by prefix
    let mNum = 0;
    for (const [k, v] of Object.entries(months)) {
      if (rawMonth.startsWith(k)) {
        mNum = v;
        break;
      }
    }
    if (mNum > 0) return `${d}/${String(mNum).padStart(2, "0")}/${y}`;
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
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Try Excel serial number (days since 1899-12-30)
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(
      excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000,
    );
    const d = String(dt2.getUTCDate()).padStart(2, "0");
    const m = String(dt2.getUTCMonth() + 1).padStart(2, "0");
    const y = dt2.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  return s;
}

import { fetchJsonSafe } from "@/lib/fetcher";

// Format average numbers to one decimal and use comma as decimal separator (e.g. "3,7")

function formatAverage(raw: any) {
  if (raw == null || raw === "") return "";
  const n = Number(String(raw).replace(",", "."));
  if (Number.isNaN(n)) return String(raw);
  // round to one decimal
  const s = n.toFixed(1);
  return s.replace(".", ",");
}

export default function Repondants() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { resort: selectedResortKey } = useSelectedResort();
  const resorts = useResorts();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["repondants", selectedResortKey, page, pageSize],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(
          `/api/resort/${selected}/respondents?page=${page}&pageSize=${pageSize}`,
          window.location.origin,
        ).toString();
        // server returns { items, total, page, pageSize }
        return await fetchJsonSafe(apiUrl, { credentials: "same-origin" });
      } catch (err) {
        console.debug(
          "Failed to fetch respondents, attempting direct Google Sheets fallback:",
          err,
        );
        try {
          // fallback: fetch sheet1 and build a simple respondents list
          const cfg = resorts.find((r) => r.key === selectedResortKey);
          if (!cfg) return { items: [], total: 0, page: 1, pageSize };
          const sheet1Url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq`;
          const r = await fetch(sheet1Url);
          if (!r.ok) return { items: [], total: 0, page: 1, pageSize };
          const text = await r.text();
          const json = parseGviz(text);
          const scols: string[] = (json.table.cols || []).map((c: any) =>
            (c.label || "").toString(),
          );
          const srows: any[] = json.table.rows || [];
          const items: any[] = [];
          for (let i = 0; i < srows.length; i++) {
            const row = srows[i];
            const c = row.c || [];
            const hasAny = (c || []).some(
              (cell: any) =>
                cell &&
                cell.v != null &&
                String(cell.v).toString().trim() !== "",
            );
            if (!hasAny) continue;
            const obj: any = {};
            obj.id = i + 1;
            obj.label = cellToString(c[4]);
            obj.name = obj.label;
            obj.email = cellToString(c[3]);
            obj.note = "";
            // Use column C (index 2) for date
            obj.date = cellToString(c[2]) || "";
            obj.age = "";
            obj.postal = cellToString(c[8]);
            obj.duration = "";
            obj.feedback = "";
            items.push(obj);
          }
          const total = items.length;
          const start = (page - 1) * pageSize;
          const pageItems = items.slice(start, start + pageSize);
          return { items: pageItems, total, page, pageSize };
        } catch (e) {
          console.error(
            "Direct Google Sheets fallback failed for respondents:",
            e,
          );
          return { items: [], total: 0, page: 1, pageSize };
        }
      }
    },
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  // fetch global summary (respondents + recommendation rate)
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["resortSummary", selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(
          `/api/resort/${selected}/summary`,
          window.location.origin,
        ).toString();
        try {
          return await fetchJsonSafe(apiUrl, { credentials: "same-origin" });
        } catch (err) {
          console.debug("Unable to load summary (will fallback):", err);
          return null;
        }
      } catch (err) {
        console.error("Failed to fetch summary:", err);
        return null;
      }
    },
    enabled: true,
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  // fetch averages (overallAverage)
  const { data: averages, isLoading: loadingAverages } = useQuery({
    queryKey: ["resortAverages", selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = new URL(
          `/api/resort/${selected}/averages`,
          window.location.origin,
        ).toString();
        try {
          return await fetchJsonSafe(apiUrl, { credentials: "same-origin" });
        } catch (err) {
          console.debug("Unable to load averages (will fallback):", err);
          return null;
        }
      } catch (err) {
        console.error("Failed to fetch averages:", err);
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
  const [selectedSnapshotName, setSelectedSnapshotName] = React.useState<string | null>(null);
  const [categoriesByRespondent, setCategoriesByRespondent] = React.useState<
    { name: string; value: string }[] | null
  >(null);
  const [loadingRespondentData, setLoadingRespondentData] =
    React.useState(false);
  const [respondentNoteGeneral, setRespondentNoteGeneral] = React.useState<
    string | null
  >(null);
  const [respondentColumnLetter, setRespondentColumnLetter] = React.useState<
    string | null
  >(null);
  const [respondentFeedback, setRespondentFeedback] = React.useState<
    string | null
  >(null);

  // helper to convert 0-based index to column letter (A, B, ... Z, AA...)
  const indexToColumn = (idx: number) => {
    let col = "";
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      n = Math.floor((n - 1) / 26);
    }
    return col;
  };

  // map to store fetched per-respondent overall notes
  const [respondentNotesMap, setRespondentNotesMap] = React.useState<Record<string,string>>({});

  const getRowKey = (row: any) => {
    if (!row) return "";
    if (row.email) return `e:${String(row.email).toLowerCase()}`;
    if (row.id) return `id:${row.id}`;
    return `n:${String(row.name || "").trim().toLowerCase()}|${String(row.date || "")}`;
  };

  React.useEffect(() => {
    if (!data || !Array.isArray((data as any).items)) return;
    const items = (data as any).items;
    let mounted = true;
    (async () => {
      for (const it of items) {
        const key = getRowKey(it);
        if (!key) continue;
        if ((respondentNotesMap as any)[key] !== undefined) continue;
        if (it.note) continue;
        try {
          const params = new URLSearchParams();
          if (it.email) params.set('email', it.email);
          if (it.name) params.set('name', it.name);
          if (it.date) params.set('date', it.date);
          const apiUrl = new URL('/api/resort/' + selectedResortKey + '/respondent?' + params.toString(), window.location.origin).toString();
          const resp = await fetchJsonSafe(apiUrl, { credentials: 'same-origin' }).catch(() => null);
          const noteVal = resp && (resp.overall ?? resp.overallAverage ?? resp.overallScore ?? resp.overall);
          if (mounted) {
            setRespondentNotesMap(prev => ({ ...prev, [key]: noteVal != null ? String(noteVal) : '' }));
          }
        } catch (e) {
          // ignore
        }
        // small throttle to avoid bursts
        await new Promise((r) => setTimeout(r, 200));
      }
    })();
    return () => { mounted = false; };
  }, [data, selectedResortKey]);

  const respondentSelIdAtRender = selected?._selId || null;
  const respondentQuery = useQuery({
    queryKey: [
      "respondentDetails",
      selectedResortKey,
      selected?.email,
      selected?.name,
      selected?.date,
    ],
    queryFn: async () => {
      if (!selected) return null;
      const params = new URLSearchParams();
      if (selected?.email) params.set("email", selected.email);
      if (selected?.name) params.set("name", selected.name);
      if (selected?.date) params.set("date", selected.date);
      // When debugging KIEHL, request server debug output
      try {
        const selName = (selected?.name || "").toString().trim().toLowerCase();
        if (selName === "kiehl") params.set("debug", "1");
      } catch (ex) {
        // ignore
      }
      const apiUrl = new URL(
        "/api/resort/" + selectedResortKey + "/respondent?" + params.toString(),
        window.location.origin,
      ).toString();
      try {
        return await fetchJsonSafe(apiUrl, { credentials: "same-origin" });
      } catch (err: any) {
        if (err && err.status === 404) return null;
        throw new Error(
          "Unable to load respondent details: " + (err && err.message),
        );
      }
    },
    enabled: !!selected && dialogOpen,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    onSuccess: (d: any) => {
      // ensure the selected hasn't changed since this query was created
      if ((selected?._selId || null) !== respondentSelIdAtRender) return;
      setCategoriesByRespondent(d?.categories || null);
      const overall = d && (d.overall ?? d.overallAverage ?? d.overallScore ?? d.overall_score ?? d.overall_value ?? null);
      // do not overwrite the note from the list row if present — prefer row.note
      if (!selected?.note) {
        setRespondentNoteGeneral(overall != null ? overall : null);
      }
      setRespondentColumnLetter(d?.column ?? null);
      setRespondentFeedback(d?.feedback ?? null);
    },
    onError: (err) => {
      console.error("Failed to fetch respondent details:", err);
      // ensure only clear when still the same selected snapshot
      if ((selected?._selId || null) !== respondentSelIdAtRender) return;
      setCategoriesByRespondent(null);
      // preserve the note from the list row if present
      if (!selected?.note) setRespondentNoteGeneral(null);
      setRespondentColumnLetter(null);
      setRespondentFeedback(null);
    },
  });
  // keep loading state in sync
  React.useEffect(() => {
    setLoadingRespondentData(Boolean(respondentQuery.isFetching));
  }, [respondentQuery.isFetching]);

  // When dialog opens for a selected respondent, fetch matrice sheet and attempt to extract per-category values
  React.useEffect(() => {
    if (!dialogOpen || !selected) return;
    let mounted = true;
    (async () => {
      setLoadingRespondentData(true);
      setCategoriesByRespondent(null);
      // prefer note from the row if available; otherwise reset and let fetch populate
      setRespondentNoteGeneral(selected?.note ?? null);
      setRespondentColumnLetter(null);
      try {
        const capturedSelId = selected?._selId || null;
        const params = new URLSearchParams();
        if (selected?.email) params.set("email", selected.email);
        if (selected?.name) params.set("name", selected.name);
        if (selected?.date) params.set("date", selected.date);
        // include debug flag automatically when inspecting KIEHL to surface server _debug
        try {
          const selName = (selected?.name || "").toString().trim().toLowerCase();
          if (selName === "kiehl") params.set("debug", "1");
        } catch (ex) {
          // ignore
        }
        const apiUrl = new URL(
          "/api/resort/" +
            selectedResortKey +
            "/respondent?" +
            params.toString(),
          window.location.origin,
        ).toString();
        try {
          const dataResp = await fetchJsonSafe(apiUrl, {
            credentials: "same-origin",
          });
          if (mounted && (selected?._selId || null) === capturedSelId) {
            setCategoriesByRespondent(dataResp.categories || null);
            const overallResp = dataResp && (dataResp.overall ?? dataResp.overallAverage ?? dataResp.overallScore ?? dataResp.overall_score ?? dataResp.overall_value ?? null);
            // Do not overwrite the note coming from the list row; prefer selected.row note when present
            if (!selected?.note) {
              setRespondentNoteGeneral(overallResp != null ? overallResp : null);
            }
            setRespondentColumnLetter(dataResp.column ?? null);
            setRespondentFeedback(dataResp.feedback ?? null);
          }
        } catch (err: any) {
          if (err && err.status === 404) {
            if (mounted && (selected?._selId || null) === capturedSelId) {
              setCategoriesByRespondent(null);
              // keep the selected row's note if it exists
              setRespondentNoteGeneral(selected?.note ?? null);
              setRespondentColumnLetter(null);
              setRespondentFeedback(null);
            }
            setLoadingRespondentData(false);
            return;
          }
          throw new Error(
            "Unable to load respondent details: " + (err && err.message),
          );
        }
      } catch (err) {
        console.error("Failed to fetch respondent matrice via server:", err);
        if (mounted) {
          setCategoriesByRespondent(null);
          // preserve selected row note when fetch fails
          setRespondentNoteGeneral(selected?.note ?? null);
          setRespondentColumnLetter(null);
          setRespondentFeedback(null);
        }
      } finally {
        if (mounted) setLoadingRespondentData(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [dialogOpen, selected]);

  // export handlers
  React.useEffect(() => {
    const btn = document.getElementById('export-all-btn');
    if (!btn) return;
    const handler = async () => {
      try {
        (btn as HTMLButtonElement).disabled = true;
        btn.textContent = 'Préparation...';
        // wait 5s per requirement
        await new Promise((res) => setTimeout(res, 5000));
        // fetch all respondents pages sequentially
        const selected = selectedResortKey;
        const all: any[] = [];
        let pageIdx = 1;
        while (true) {
          const apiUrl = new URL(`/api/resort/${selected}/respondents?page=${pageIdx}&pageSize=500`, window.location.origin).toString();
          const resp = await fetch(apiUrl, { credentials: 'same-origin' });
          if (!resp.ok) break;
          const json = await resp.json().catch(() => null);
          if (!json || !Array.isArray(json.items)) break;
          all.push(...json.items);
          if (all.length >= json.total) break;
          pageIdx++;
        }
        // dynamically import pdf helper
        const mod = await import('@/lib/pdf');
        await mod.exportAllRespondentsPdf(selectedResortKey, all, (done: number, total: number) => {
          btn.textContent = `Exportation ${done}/${total}…`;
        });
        btn.textContent = 'Téléchargement terminé';
      } catch (e) {
        console.error('Export all failed', e);
        btn.textContent = 'Échec de l\'export';
      } finally {
        setTimeout(() => {
          if (btn) { btn.textContent = 'Exporter tous les répondants (PDF)'; (btn as HTMLButtonElement).disabled = false; }
        }, 2500);
      }
    };
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, [selectedResortKey]);

  React.useEffect(() => {
    if (!dialogOpen) {
      setSelectedSnapshotName(null);
    }
  }, [dialogOpen]);

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
                <div className="flex items-center justify-between mb-3">
                  <div />
                  <div className="flex items-center gap-2">
                    <button id="export-all-btn" onClick={async () => { /* placeholder, will be wired below */ }} className="px-3 py-2 rounded-md bg-primary text-white">Exporter tous les répondants (PDF)</button>
                    <button onClick={async () => {
                      const qc = useQueryClient();
                      const id = toast({ title: 'Actualisation', description: 'Récupération des données depuis Google Sheets…' });
                      try {
                        // Invalidate and refetch relevant queries for the currently selected resort
                        await qc.invalidateQueries(["repondants", selectedResortKey]);
                        await qc.invalidateQueries(["resortSummary", selectedResortKey]);
                        await qc.invalidateQueries(["resortAverages", selectedResortKey]);
                        // Trigger refetch
                        await qc.refetchQueries({ queryKey: ["repondants", selectedResortKey], exact: false });
                        await qc.refetchQueries({ queryKey: ["resortSummary", selectedResortKey], exact: false });
                        await qc.refetchQueries({ queryKey: ["resortAverages", selectedResortKey], exact: false });
                        toast({ title: 'Actualisation terminée', description: 'Les données ont été mises à jour.' });
                      } catch (e) {
                        console.error('Refresh failed', e);
                        toast({ title: 'Erreur', description: 'Impossible d\'actualiser les données.' , variant: 'destructive' as any});
                      }
                    }} className="px-3 py-2 rounded-md border text-sm">Actualiser</button>
                  </div>
                </div>
                {isLoading && <div>Chargement…</div>}
                {isError && (
                  <div className="text-red-600">
                    Impossible de charger les répondants.
                  </div>
                )}

                {data && (
                  <div className="overflow-x-auto overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 table-auto">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Nom
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Note Général
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Date
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Âges
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Code postal
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Durée du voyage
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {(data.items || []).map((row: any, i: number) => (
                          <tr key={getRowKey(row) || i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {row.name || row.label || row.email}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {(() => {
                              const key = getRowKey(row);
                              const noteRaw = row.note ?? (key ? (respondentNotesMap as any)[key] : undefined);
                              if (noteRaw != null && noteRaw !== "") return formatAverage(noteRaw);
                              if (averages && (averages as any).overallAverage) return formatAverage((averages as any).overallAverage);
                              return "—";
                            })()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {formatDateToFR(row.date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {row.age || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {row.postal}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {row.duration}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    const selId = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                                    setSelected({ ...row, __selId: selId });
                                    setSelectedSnapshotName(row?.name || row?.label || row?.email || null);
                                    setDialogOpen(true);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-full border p-2 hover:bg-gray-100"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>

                                <button
                                  onClick={async () => {
                                    try {
                                      const btn = document.getElementById('export-single-btn-' + i) as HTMLButtonElement | null;
                                      if (btn) { btn.disabled = true; btn.textContent = 'Préparation...'; }
                                      const mod = await import('@/lib/pdf');
                                      await mod.exportRespondentPdf(selectedResortKey, row);
                                      if (btn) btn.textContent = 'Téléchargé';
                                      setTimeout(() => { if (btn) { btn.textContent = 'PDF'; btn.disabled = false; } }, 2000);
                                    } catch (e) {
                                      console.error('Export respondent failed', e);
                                      try { toast({ title: 'Échec de l\'export PDF', description: String(e && (e.message || e)) }); } catch (_) {}
                                      const btn = document.getElementById('export-single-btn-' + i) as HTMLButtonElement | null;
                                      if (btn) { btn.textContent = 'Erreur'; setTimeout(() => { if (btn) { btn.textContent = 'PDF'; btn.disabled = false; } }, 2000); }
                                    }
                                  }}
                                  id={`export-single-btn-${i}`}
                                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-secondary"
                                >
                                  PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm text-muted-foreground">
                        Affichage {(data.page - 1) * data.pageSize + 1} -{" "}
                        {Math.min(data.total, data.page * data.pageSize)} sur{" "}
                        {data.total}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPage(Math.max(1, page - 1))}
                          disabled={page <= 1}
                          className="px-3 py-1 border rounded"
                        >
                          Préc
                        </button>
                        <div className="text-sm">
                          Page {data.page} /{" "}
                          {Math.max(1, Math.ceil(data.total / data.pageSize))}
                        </div>
                        <button
                          onClick={() =>
                            setPage(
                              Math.min(
                                Math.max(
                                  1,
                                  Math.ceil(data.total / data.pageSize),
                                ),
                                page + 1,
                              ),
                            )
                          }
                          disabled={
                            page >= Math.ceil(data.total / data.pageSize)
                          }
                          className="px-3 py-1 border rounded"
                        >
                          Suiv
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent
              className="max-w-3xl max-h-[80vh] overflow-auto"
              aria-describedby="respondent-dialog-desc"
            >
              {
                // Resolve the displayed row by looking up the latest row in the current page by key.
                // This prevents mismatches when React reuses DOM nodes or data updates reorder items.
              }
              <DialogTitle>
                {(() => {
                  const key = getRowKey(selected);
                  const live = (data && (data as any).items || []).find((r: any) => getRowKey(r) === key);
                  const rowToShow = live || selected;
                  // Prefer the exact name the user clicked (snapshot) to avoid mismatches
                  return selectedSnapshotName || rowToShow?.name || rowToShow?.label || rowToShow?.email || "Anonyme";
                })()}
              </DialogTitle>
              <DialogDescription id="respondent-dialog-desc">
                Détails et moyennes pour le répondant sélectionné
              </DialogDescription>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className="rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Note Général
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    {loadingRespondentData
                      ? "…"
                      : respondentNoteGeneral
                        ? `${formatAverage(respondentNoteGeneral)}/5`
                        : (() => {
                            const key = getRowKey(selected);
                            const fromMap = key ? (respondentNotesMap as any)[key] : null;
                            if (fromMap) return `${formatAverage(fromMap)}/5`;
                            if (averages && (averages as any).overallAverage) return `${formatAverage((averages as any).overallAverage)}/5`;
                            return "—";
                          })()}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {respondentColumnLetter
                      ? `Colonne ${respondentColumnLetter} de la fiche matrice (correspondant au répondant)`
                      : "Colonne L de la fiche matrice (correspondant au répondant) / 5"}
                  </div>
                </div>

                <div
                  className="md:col-span-2 rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Votre avis
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-line">
                    {loadingRespondentData
                      ? "…"
                      : respondentFeedback
                        ? respondentFeedback
                        : "—"}
                  </div>
                </div>

                <div
                  className="rounded-lg border p-4 bg-white"
                  style={{ borderColor: "#e6edf3" }}
                >
                  <div className="text-xs text-muted-foreground">
                    Moyennes par catégorie (répondant)
                  </div>
                  <div className="mt-2 text-sm">
                    {loadingRespondentData && <div>Chargement…</div>}
                    {!loadingRespondentData &&
                      categoriesByRespondent &&
                      categoriesByRespondent.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                          Aucune donnée de catégories trouvée pour ce
                          répondant.
                        </div>
                      )}
                    {!loadingRespondentData &&
                      categoriesByRespondent &&
                      categoriesByRespondent.length > 0 && (
                        <div className="space-y-2 max-h-72 overflow-auto">
                          {categoriesByRespondent.map((c, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center px-2 py-1 border-b last:border-b-0"
                            >
                              <div className="text-sm text-gray-700">
                                {c.name}
                              </div>
                              <div className="text-sm font-medium text-gray-900">
                                {(() => {
                                  const nameKeys = /^(nom|name|client)$/i;
                                  const isNameCategory = c.name && nameKeys.test(String(c.name).trim());
                                  if (isNameCategory) {
                                    return selectedSnapshotName || selected?.name || selected?.label || selected?.email || "—";
                                  }
                                  return c.value ? formatAverage(c.value) : "—";
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    {!loadingRespondentData &&
                      categoriesByRespondent === null && (
                        <div className="text-sm text-muted-foreground">
                          Impossible de déterminer les moyennes par catégorie
                          pour ce répondant.
                        </div>
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
