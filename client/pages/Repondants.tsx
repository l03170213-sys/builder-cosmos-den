import React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import * as pdfLib from "@/lib/pdf";
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
  const sheetsDate = s.match(
    /^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})(?:\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*)?\)$/,
  );
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

function clusterAgencies(items: any[]) {
  if (!items || !Array.isArray(items)) return [];
  // normalize helper
  const normalize = (s: string) =>
    s
      .toString()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\u0000-\u007F\s]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const levenshtein = (a: string, b: string) => {
    const A = a || "";
    const B = b || "";
    const n = A.length;
    const m = B.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const dp: number[][] = Array.from({ length: n + 1 }, () =>
      Array(m + 1).fill(0),
    );
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = A[i - 1] === B[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }
    return dp[n][m];
  };
  const similarity = (a: string, b: string) => {
    const A = normalize(a);
    const B = normalize(b);
    if (A === B) return 1;
    const maxLen = Math.max(A.length, B.length);
    if (maxLen === 0) return 1;
    const dist = levenshtein(A, B);
    return 1 - dist / maxLen;
  };
  const counts: Record<string, number> = {};
  for (const it of items) {
    if (!it || !it.agency) continue;
    const raw = String(it.agency).trim();
    if (!raw) continue;
    counts[raw] = (counts[raw] || 0) + 1;
  }
  const uniques = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const clusters: { repr: string; members: string[]; total: number }[] = [];
  const THRESH = 0.25;
  for (const u of uniques) {
    let placed = false;
    for (const cl of clusters) {
      const sim = similarity(u, cl.repr);
      if (sim >= THRESH) {
        cl.members.push(u);
        cl.total += counts[u];
        if (counts[u] > (counts[cl.repr] || 0)) cl.repr = u;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ repr: u, members: [u], total: counts[u] });
    }
  }
  const results: { display: string; queryValue: string }[] = clusters.map(
    (cl) => {
      const most = cl.repr;
      const rawHasUpper = /[A-Z]/.test(most);
      const display = rawHasUpper
        ? most
        : normalize(most)
            .split(" ")
            .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
            .join(" ");
      return { display, queryValue: most };
    },
  );
  results.sort((a, b) => a.display.localeCompare(b.display));
  return results;
}

export default function Repondants() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { resort: selectedResortKey } = useSelectedResort();
  const resorts = useResorts();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const [gotoPage, setGotoPage] = React.useState<string>("");

  // New filter and sort states
  const [nameFilter, setNameFilter] = React.useState<string>("");
  const [agencyFilter, setAgencyFilter] = React.useState<string>("");
  const [agencyQueryValue, setAgencyQueryValue] = React.useState<string>("");
  const [startDateFilter, setStartDateFilter] = React.useState<string>(""); // yyyy-mm-dd
  const [endDateFilter, setEndDateFilter] = React.useState<string>("");
  const [sortDateDir, setSortDateDir] = React.useState<string>("desc"); // 'asc' | 'desc' | ''
  // Search across all resorts mode: 'none' | 'name' | 'agency'
  const [searchAllMode, setSearchAllMode] = React.useState<
    "none" | "name" | "agency"
  >("none");

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "repondants",
      selectedResortKey,
      page,
      pageSize,
      nameFilter,
      agencyFilter,
      startDateFilter,
      endDateFilter,
      sortDateDir,
      searchAllMode,
      resorts.map((r) => r.key).join(","),
    ],
    queryFn: async () => {
      try {
        // If searching across all resorts, fetch each resort's respondents and merge
        if (searchAllMode !== "none") {
          const allResults = await Promise.all(
            resorts.map(async (rs) => {
              try {
                const params = new URLSearchParams();
                params.set("page", "1");
                params.set("pageSize", "500");
                if (searchAllMode === "name" && nameFilter)
                  params.set("name", nameFilter);
                if (searchAllMode === "agency" && agencyFilter)
                  params.set("agency", agencyQueryValue || agencyFilter);
                if (startDateFilter) params.set("startDate", startDateFilter);
                if (endDateFilter) params.set("endDate", endDateFilter);
                if (sortDateDir) params.set("sortDate", sortDateDir);
                const apiUrl = `/api/resort/${rs.key}/respondents?${params.toString()}`;
                let json: any = { items: [], total: 0 };
                try {
                  json = await fetchJsonSafe(apiUrl, {
                    credentials: "same-origin",
                  });
                } catch (e) {
                  json = { items: [], total: 0 };
                }
                return json;
              } catch (e) {
                return { items: [], total: 0 };
              }
            }),
          );

          const allItems = allResults.flatMap((r: any) => r.items || []);
          // apply client-side date filtering if not already present
          let filtered = allItems;
          if (startDateFilter || endDateFilter) {
            const sd = startDateFilter ? new Date(startDateFilter) : null;
            const ed = endDateFilter ? new Date(endDateFilter) : null;
            filtered = filtered.filter((r: any) => {
              if (!r.date) return false;
              const d = new Date(r.date.toString().replace(/Date\(|\)/g, ""));
              if (isNaN(d.getTime())) return false;
              if (sd && d.getTime() < sd.getTime()) return false;
              if (ed && d.getTime() > ed.getTime()) return false;
              return true;
            });
          }
          if (sortDateDir === "asc" || sortDateDir === "desc") {
            filtered.sort((a: any, b: any) => {
              const da = new Date(a.date || "");
              const db = new Date(b.date || "");
              const ta = isNaN(da.getTime()) ? 0 : da.getTime();
              const tb = isNaN(db.getTime()) ? 0 : db.getTime();
              return sortDateDir === "asc" ? ta - tb : tb - ta;
            });
          }

          const total = filtered.length;
          const startIdx = (page - 1) * pageSize;
          const pageItems = filtered.slice(startIdx, startIdx + pageSize);
          return { items: pageItems, total, page, pageSize };
        }

        // default: fetch only selected resort
        const selected = selectedResortKey;
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (nameFilter) params.set("name", nameFilter);
        if (agencyFilter)
          params.set("agency", agencyQueryValue || agencyFilter);
        if (startDateFilter) params.set("startDate", startDateFilter);
        if (endDateFilter) params.set("endDate", endDateFilter);
        if (sortDateDir) params.set("sortDate", sortDateDir);
        const apiUrl = `/api/resort/${selected}/respondents?${params.toString()}`;
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
            // agency column H
            obj.agency = cellToString(c[7]);
            items.push(obj);
          }

          // apply client-side filtering in fallback
          let filtered = items;
          if (nameFilter) {
            const nf = nameFilter.toLowerCase();
            filtered = filtered.filter((r) =>
              (r.name || "").toLowerCase().includes(nf),
            );
          }
          if (agencyFilter) {
            const af = (agencyQueryValue || agencyFilter).toLowerCase();
            filtered = filtered.filter((r) =>
              (r.agency || "").toLowerCase().includes(af),
            );
          }
          if (startDateFilter || endDateFilter) {
            const sd = startDateFilter ? new Date(startDateFilter) : null;
            const ed = endDateFilter ? new Date(endDateFilter) : null;
            filtered = filtered.filter((r) => {
              if (!r.date) return false;
              const d = new Date(r.date.toString().replace(/Date\(|\)/g, ""));
              if (isNaN(d.getTime())) return false;
              if (sd && d.getTime() < sd.getTime()) return false;
              if (ed && d.getTime() > ed.getTime()) return false;
              return true;
            });
          }
          if (sortDateDir === "asc" || sortDateDir === "desc") {
            filtered.sort((a, b) => {
              const da = new Date(a.date || "");
              const db = new Date(b.date || "");
              const ta = isNaN(da.getTime()) ? 0 : da.getTime();
              const tb = isNaN(db.getTime()) ? 0 : db.getTime();
              return sortDateDir === "asc" ? ta - tb : tb - ta;
            });
          }

          const total = filtered.length;
          const start = (page - 1) * pageSize;
          const pageItems = filtered.slice(start, start + pageSize);
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

  // fetch agencies for selected resort to populate dropdown
  const { data: agencies, isLoading: loadingAgencies } = useQuery({
    queryKey: ["resortAgencies", selectedResortKey],
    queryFn: async () => {
      try {
        const sel = selectedResortKey;
        if (!sel) return [];
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("pageSize", "500");
        const apiUrl = `/api/resort/${sel}/respondents?${params.toString()}`;
        const resp = await fetch(apiUrl, { credentials: "same-origin" });
        if (!resp.ok) return [];
        const json = await resp.json().catch(() => ({ items: [] }));
        const items = json.items || [];
        // normalize and group similar agency names (case/spacing/diacritics differences)
        const normalize = (s: string) =>
          s
            .toString()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^ -\u007F\s]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const groups: Record<string, Record<string, number>> = {};
        for (const it of items) {
          if (!it || !it.agency) continue;
          const raw = String(it.agency).trim();
          if (!raw) continue;
          const key = normalize(raw);
          groups[key] = groups[key] || {};
          groups[key][raw] = (groups[key][raw] || 0) + 1;
        }
        const results: { display: string; queryValue: string }[] = [];
        for (const key of Object.keys(groups)) {
          const variants = groups[key];
          // pick most common raw variant as queryValue and display candidate
          const entries = Object.keys(variants).map((v) => ({
            v,
            c: variants[v],
          }));
          entries.sort((a, b) => b.c - a.c);
          const most = entries[0];
          // build a nicer display (title case) unless the raw variant has uppercase letters indicating branding
          const rawHasUpper = /[A-Z]/.test(most.v);
          const display = rawHasUpper
            ? most.v
            : key
                .split(" ")
                .map((word) =>
                  word.length > 0 ? word[0].toUpperCase() + word.slice(1) : "",
                )
                .join(" ");
          results.push({ display, queryValue: most.v });
        }
        results.sort((a, b) => a.display.localeCompare(b.display));
        return clusterAgencies(items);
      } catch (e) {
        return [];
      }
    },
    enabled: !!selectedResortKey,
    refetchOnWindowFocus: false,
  });

  // fetch global summary (respondents + recommendation rate)
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["resortSummary", selectedResortKey],
    queryFn: async () => {
      try {
        const selected = selectedResortKey;
        const apiUrl = `/api/resort/${selected}/summary`;
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
        const apiUrl = `/api/resort/${selected}/averages`;
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
  const [selectedSnapshotName, setSelectedSnapshotName] = React.useState<
    string | null
  >(null);
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
  const [respondentNotesMap, setRespondentNotesMap] = React.useState<
    Record<string, string>
  >({});

  const getRowKey = (row: any) => {
    if (!row) return "";
    if (row.id != null) return `id:${row.id}`;
    if (row.email && row.date)
      return `e:${String(row.email).toLowerCase()}|d:${String(row.date)}`;
    if (row.email) return `e:${String(row.email).toLowerCase()}`;
    return `n:${String(row.name || "")
      .trim()
      .toLowerCase()}|${String(row.date || "")}`;
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
          if (it.email) params.set("email", it.email);
          if (it.name) params.set("name", it.name);
          if (it.date) params.set("date", it.date);
          const apiUrl = `/api/resort/${selectedResortKey}/respondent?${params.toString()}`;
          let resp = await fetchJsonSafe(apiUrl, {
            credentials: "same-origin",
          }).catch(() => null);
          let noteVal =
            resp &&
            (resp.overall ??
              resp.overallAverage ??
              resp.overallScore ??
              resp.overall);

          // fallback: client-side matrice lookup for locally added resorts
          if (noteVal == null || noteVal === "") {
            try {
              const cfg = resorts.find((r) => r.key === selectedResortKey);
              if (cfg && cfg.gidMatrice) {
                const mod = await import("@/lib/sheets");
                const fromM = await mod.fetchRespondentOverallFromMatrice(
                  cfg.sheetId,
                  cfg.gidMatrice,
                  { email: it.email, name: it.name, date: it.date },
                );
                if (fromM != null) noteVal = fromM;
              }
            } catch (e) {
              // ignore
            }
          }

          if (mounted) {
            setRespondentNotesMap((prev) => ({
              ...prev,
              [key]: noteVal != null ? String(noteVal) : "",
            }));
          }
        } catch (e) {
          // ignore
        }
        // small throttle to avoid bursts
        await new Promise((r) => setTimeout(r, 200));
      }
    })();
    return () => {
      mounted = false;
    };
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
      const apiUrl = `/api/resort/${selectedResortKey}/respondent?${params.toString()}`;
      try {
        const serverResp = await fetchJsonSafe(apiUrl, {
          credentials: "same-origin",
        }).catch(() => null);
        if (
          serverResp &&
          (serverResp.overall ??
            serverResp.overallAverage ??
            serverResp.overallScore ??
            serverResp.overall) != null
        ) {
          return serverResp;
        }
        // fallback to client-side matrice lookup for detailed categories
        try {
          const cfg = resorts.find((r) => r.key === selectedResortKey);
          if (cfg && cfg.gidMatrice) {
            const mod = await import("@/lib/sheets");
            const details = await mod.fetchRespondentDetailsFromSheet(
              cfg.sheetId,
              cfg.gidMatrice,
              {
                email: selected?.email,
                name: selected?.name,
                date: selected?.date,
              },
            );
            if (details) return details as any;
          }
        } catch (e) {
          // ignore
        }
        return serverResp;
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
      const overall =
        d &&
        (d.overall ??
          d.overallAverage ??
          d.overallScore ??
          d.overall_score ??
          d.overall_value ??
          null);
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
        // If we have the respondent row id from the list, pass it to the server to perform an exact row lookup
        if ((selected as any)?.id)
          params.set("row", String((selected as any).id));
        // include debug flag automatically when inspecting KIEHL to surface server _debug
        try {
          const selName = (selected?.name || "")
            .toString()
            .trim()
            .toLowerCase();
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
            const overallResp =
              dataResp &&
              (dataResp.overall ??
                dataResp.overallAverage ??
                dataResp.overallScore ??
                dataResp.overall_score ??
                dataResp.overall_value ??
                dataResp.overall ??
                null);
            // Do not overwrite the note coming from the list row; prefer selected.row note when present
            if (!selected?.note) {
              setRespondentNoteGeneral(
                overallResp != null ? overallResp : null,
              );
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
    const btn = document.getElementById("export-all-btn");
    if (!btn) return;
    const handler = async () => {
      try {
        (btn as HTMLButtonElement).disabled = true;
        btn.textContent = "Préparation...";
        // wait 5s per requirement
        await new Promise((res) => setTimeout(res, 5000));
        // decide resort keys to fetch
        const resortKeys =
          searchAllMode === "none"
            ? [selectedResortKey]
            : resorts.map((r) => r.key);
        const all: any[] = [];
        for (const rk of resortKeys) {
          let pageIdx = 1;
          while (true) {
            const params = new URLSearchParams();
            params.set("page", String(pageIdx));
            params.set("pageSize", String(500));
            if (
              nameFilter &&
              (searchAllMode === "none" || searchAllMode === "name")
            )
              params.set("name", nameFilter);
            if (
              agencyFilter &&
              (searchAllMode === "none" || searchAllMode === "agency")
            )
              params.set("agency", agencyQueryValue || agencyFilter);
            if (startDateFilter) params.set("startDate", startDateFilter);
            if (endDateFilter) params.set("endDate", endDateFilter);
            if (sortDateDir) params.set("sortDate", sortDateDir);
            const apiUrl = `/api/resort/${rk}/respondents?${params.toString()}`;
            let json: any = null;
            try {
              json = await fetchJsonSafe(apiUrl, {
                credentials: "same-origin",
              });
            } catch (e) {
              break;
            }
            if (!json || !Array.isArray(json.items)) break;
            all.push(...json.items);
            if (all.length >= json.total) break;
            pageIdx++;
          }
        }
        // use static pdf helper
        await pdfLib.exportAllRespondentsPdf(
          selectedResortKey,
          all,
          (done: number, total: number) => {
            btn.textContent = `Exportation ${done}/${total}…`;
          },
        );
        btn.textContent = "Téléchargement terminé";
      } catch (e) {
        console.error("Export all failed", e);
        btn.textContent = "Échec de l'export";
      } finally {
        setTimeout(() => {
          if (btn) {
            btn.textContent = "Exporter tous les répondants (PDF)";
            (btn as HTMLButtonElement).disabled = false;
          }
        }, 2500);
      }
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [
    selectedResortKey,
    nameFilter,
    agencyFilter,
    startDateFilter,
    endDateFilter,
    sortDateDir,
    searchAllMode,
    resorts,
  ]);

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
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Rechercher par nom"
                        value={nameFilter}
                        onChange={(e) => {
                          setNameFilter(e.target.value);
                          setPage(1);
                        }}
                        className="rounded-md border px-3 py-2 text-sm w-56"
                      />
                      <button
                        onClick={() => {
                          setSearchAllMode((prev) =>
                            prev === "name" ? "none" : "name",
                          );
                          setPage(1);
                        }}
                        className={`px-2 py-2 text-sm rounded-md border ${searchAllMode === "name" ? "bg-primary text-white" : ""}`}
                        title="Rechercher dans tous les hôtels"
                      >
                        Tous les hôtels
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Agence de voyage"
                        value={agencyFilter}
                        onChange={(e) => {
                          setAgencyFilter(e.target.value);
                          setPage(1);
                        }}
                        className="rounded-md border px-3 py-2 text-sm w-56"
                      />
                      <button
                        onClick={() => {
                          setSearchAllMode((prev) =>
                            prev === "agency" ? "none" : "agency",
                          );
                          setPage(1);
                        }}
                        className={`px-2 py-2 text-sm rounded-md border ${searchAllMode === "agency" ? "bg-primary text-white" : ""}`}
                        title="Rechercher dans tous les hôtels"
                      >
                        Tous les hôtels
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">Du</label>
                      <input
                        type="date"
                        value={startDateFilter}
                        onChange={(e) => {
                          setStartDateFilter(e.target.value);
                          setPage(1);
                        }}
                        className="rounded-md border px-2 py-1 text-sm"
                      />
                      <label className="text-sm">Au</label>
                      <input
                        type="date"
                        value={endDateFilter}
                        onChange={(e) => {
                          setEndDateFilter(e.target.value);
                          setPage(1);
                        }}
                        className="rounded-md border px-2 py-1 text-sm"
                      />
                    </div>

                    {/* Agencies dropdown and download button for selected resort */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm">Agences</label>
                      <select
                        value={agencyFilter}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAgencyFilter(val);
                          // find corresponding queryValue
                          try {
                            const found = (agencies || []).find(
                              (a: any) => a.display === val,
                            );
                            if (found)
                              setAgencyQueryValue(found.queryValue || val);
                            else setAgencyQueryValue(val);
                          } catch (err) {
                            setAgencyQueryValue(val);
                          }
                          setPage(1);
                        }}
                        className="rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="">Toutes les agences</option>
                        {(() => {
                          try {
                            const ags = agencies || [];
                            return ags.map((a: any, idx: number) => (
                              <option key={idx} value={a.display}>
                                {a.display}
                              </option>
                            ));
                          } catch (e) {
                            return null;
                          }
                        })()}
                      </select>

                      <button
                        onClick={async () => {
                          try {
                            const sel = selectedResortKey;
                            if (!sel) return;
                            // fetch all respondents for agency
                            const params = new URLSearchParams();
                            params.set("page", "1");
                            params.set("pageSize", "500");
                            if (agencyFilter)
                              params.set(
                                "agency",
                                agencyQueryValue || agencyFilter,
                              );
                            if (startDateFilter)
                              params.set("startDate", startDateFilter);
                            if (endDateFilter)
                              params.set("endDate", endDateFilter);
                            const apiUrl = `/api/resort/${sel}/respondents?${params.toString()}`;
                            let json: any = { items: [], total: 0 };
                            try {
                              json = await fetchJsonSafe(apiUrl, {
                                credentials: "same-origin",
                              });
                            } catch (e) {
                              throw new Error(
                                "Impossible de récupérer les répondants",
                              );
                            }
                            const items = json.items || [];
                            // compute average of numeric notes
                            const nums: number[] = items
                              .map((it: any) => {
                                const v = it.note || "";
                                const n = Number(String(v).replace(",", "."));
                                return Number.isFinite(n) ? n : NaN;
                              })
                              .filter((n) => !Number.isNaN(n));
                            const avg = nums.length
                              ? nums.reduce((a, b) => a + b, 0) / nums.length
                              : null;
                            const avgStr =
                              avg != null
                                ? avg.toFixed(1).replace(".", ",")
                                : null;
                            // compute category averages by fetching respondent details
                            const catMap: Record<
                              string,
                              { sum: number; count: number }
                            > = {};
                            for (let i = 0; i < items.length; i++) {
                              const it = items[i];
                              const p = new URLSearchParams();
                              if (it.email) p.set("email", it.email);
                              if (it.name) p.set("name", it.name);
                              if (it.date) p.set("date", it.date);
                              const url = `/api/resort/${sel}/respondent?${p.toString()}`;
                              const details = await fetch(url, {
                                credentials: "same-origin",
                              })
                                .then((r) =>
                                  r.ok ? r.json().catch(() => null) : null,
                                )
                                .catch(() => null);
                              const cats = details?.categories || null;
                              if (cats && Array.isArray(cats)) {
                                for (const c of cats) {
                                  const key = String((c.name || "").trim());
                                  const v = Number(
                                    String(c.value || "").replace(",", "."),
                                  );
                                  if (!Number.isFinite(v)) continue;
                                  const lk = key.toLowerCase();
                                  if (!catMap[lk])
                                    catMap[lk] = { sum: 0, count: 0 };
                                  catMap[lk].sum += v;
                                  catMap[lk].count += 1;
                                }
                              }
                              // small throttle
                              await new Promise((r) => setTimeout(r, 200));
                            }
                            const categoryAverages = Object.keys(catMap).map(
                              (k) => ({
                                name: k.replace(/^./, (s) => s.toUpperCase()),
                                average: catMap[k].count
                                  ? catMap[k].sum / catMap[k].count
                                  : null,
                                count: catMap[k].count,
                              }),
                            );

                            // call export function with overall average and category averages
                            await pdfLib.exportAllRespondentsPdf(
                              sel,
                              items,
                              {
                                overallAverage: avgStr,
                                categoryAverages,
                                title: `Agence: ${agencyFilter || "Toutes"}`,
                                count: items.length,
                                filename: `respondents-agence-${(agencyFilter || "all").replace(/[^a-z0-9_\-]/gi, "_")}.pdf`,
                              },
                              (done: number, total: number) => {
                                const btn = document.getElementById(
                                  "export-single-agency-btn",
                                ) as HTMLButtonElement | null;
                                if (btn)
                                  btn.textContent = `Exportation ${done}/${total}…`;
                              },
                            );
                          } catch (e: any) {
                            console.error("Export agency failed", e);
                            toast({
                              title: "Échec",
                              description: String(e && (e.message || e)),
                            });
                          } finally {
                            const btn = document.getElementById(
                              "export-single-agency-btn",
                            ) as HTMLButtonElement | null;
                            if (btn)
                              setTimeout(() => {
                                btn.textContent = "Télécharger l'agence";
                              }, 2000);
                          }
                        }}
                        id="export-single-agency-btn"
                        className="px-3 py-2 rounded-md bg-primary text-white"
                      >
                        Télécharger l'agence
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            const sel = selectedResortKey;
                            if (!sel) return;
                            const params = new URLSearchParams();
                            params.set("page", "1");
                            params.set("pageSize", "500");
                            if (agencyFilter)
                              params.set(
                                "agency",
                                agencyQueryValue || agencyFilter,
                              );
                            if (startDateFilter)
                              params.set("startDate", startDateFilter);
                            if (endDateFilter)
                              params.set("endDate", endDateFilter);
                            const apiUrl = `/api/resort/${sel}/respondents?${params.toString()}`;
                            let json: any = { items: [], total: 0 };
                            try {
                              json = await fetchJsonSafe(apiUrl, {
                                credentials: "same-origin",
                              });
                            } catch (e) {
                              throw new Error(
                                "Impossible de récupérer les répondants",
                              );
                            }
                            const items = json.items || [];
                            // For each respondent fetch categories
                            const catMap: Record<
                              string,
                              { sum: number; count: number }
                            > = {};
                            for (let i = 0; i < items.length; i++) {
                              const it = items[i];
                              const p = new URLSearchParams();
                              if (it.email) p.set("email", it.email);
                              if (it.name) p.set("name", it.name);
                              if (it.date) p.set("date", it.date);
                              const url = `/api/resort/${sel}/respondent?${p.toString()}`;
                              const details = await fetch(url, {
                                credentials: "same-origin",
                              })
                                .then((r) =>
                                  r.ok ? r.json().catch(() => null) : null,
                                )
                                .catch(() => null);
                              const cats = details?.categories || null;
                              if (cats && Array.isArray(cats)) {
                                for (const c of cats) {
                                  const key = String(
                                    (c.name || "").trim(),
                                  ).toLowerCase();
                                  const v = Number(
                                    String(c.value || "").replace(",", "."),
                                  );
                                  if (!Number.isFinite(v)) continue;
                                  if (!catMap[key])
                                    catMap[key] = { sum: 0, count: 0 };
                                  catMap[key].sum += v;
                                  catMap[key].count += 1;
                                }
                              }
                              // small throttle
                              await new Promise((r) => setTimeout(r, 200));
                            }
                            const averages = Object.keys(catMap).map((k) => ({
                              name: k,
                              average: catMap[k].count
                                ? catMap[k].sum / catMap[k].count
                                : null,
                              count: catMap[k].count,
                            }));
                            // normalize display names (capitalize)
                            const display = averages.map((a) => ({
                              name: a.name.replace(/^./, (s) =>
                                s.toUpperCase(),
                              ),
                              average: a.average,
                              count: a.count,
                            }));
                            await pdfLib.exportAgencyCategoryAveragesPdf(
                              sel,
                              agencyFilter || "Toutes",
                              display,
                              {
                                title: `Moyennes par catégorie - ${agencyFilter || "Toutes"}`,
                                filename: `moyennes-agence-${(agencyFilter || "all").replace(/[^a-z0-9_\\-]/gi, "_")}.pdf`,
                              },
                            );
                          } catch (e: any) {
                            console.error("Moyennes agence failed", e);
                            toast({
                              title: "Échec",
                              description: String(e && (e.message || e)),
                            });
                          }
                        }}
                        className="px-3 py-2 rounded-md border text-sm"
                      >
                        Moyenne par catégorie
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setNameFilter("");
                        setAgencyFilter("");
                        setStartDateFilter("");
                        setEndDateFilter("");
                        setSortDateDir("desc");
                        setPage(1);
                      }}
                      className="px-3 py-2 rounded-md border text-sm"
                    >
                      Effacer
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      id="export-all-btn"
                      onClick={async () => {
                        /* placeholder, will be wired below */
                      }}
                      className="px-3 py-2 rounded-md bg-primary text-white"
                    >
                      Exporter tous les répondants (PDF)
                    </button>
                    <button
                      onClick={async () => {
                        const qc = queryClient;
                        const id = toast({
                          title: "Actualisation",
                          description:
                            "Récupération des données depuis Google Sheets…",
                        });
                        try {
                          await qc.invalidateQueries([
                            "repondants",
                            selectedResortKey,
                          ]);
                          await qc.invalidateQueries([
                            "resortSummary",
                            selectedResortKey,
                          ]);
                          await qc.invalidateQueries([
                            "resortAverages",
                            selectedResortKey,
                          ]);
                          await qc.refetchQueries({
                            queryKey: ["repondants", selectedResortKey],
                            exact: false,
                          });
                          await qc.refetchQueries({
                            queryKey: ["resortSummary", selectedResortKey],
                            exact: false,
                          });
                          await qc.refetchQueries({
                            queryKey: ["resortAverages", selectedResortKey],
                            exact: false,
                          });
                          toast({
                            title: "Actualisation terminée",
                            description: "Les données ont été mises à jour.",
                          });
                        } catch (e) {
                          console.error("Refresh failed", e);
                          toast({
                            title: "Erreur",
                            description: "Impossible d'actualiser les données.",
                            variant: "destructive" as any,
                          });
                        }
                      }}
                      className="px-3 py-2 rounded-md border text-sm"
                    >
                      Actualiser
                    </button>
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
                          <tr
                            key={
                              row && row.id != null
                                ? `id:${row.id}`
                                : getRowKey(row) ||
                                  `${i}-${String(row.email || row.name || "")}`
                            }
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {row.name || row.label || row.email}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {(() => {
                                const key = getRowKey(row);
                                const noteRaw =
                                  row.note ??
                                  (key
                                    ? (respondentNotesMap as any)[key]
                                    : undefined);
                                if (noteRaw != null && noteRaw !== "")
                                  return formatAverage(noteRaw);
                                if (
                                  averages &&
                                  (averages as any).overallAverage
                                )
                                  return formatAverage(
                                    (averages as any).overallAverage,
                                  );
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
                                    const selId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                    setSelected({ ...row, _selId: selId });
                                    setSelectedSnapshotName(
                                      row?.name ||
                                        row?.label ||
                                        row?.email ||
                                        null,
                                    );
                                    setDialogOpen(true);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-full border p-2 hover:bg-gray-100"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>

                                <button
                                  onClick={async () => {
                                    try {
                                      const btn = document.getElementById(
                                        "export-single-btn-" + i,
                                      ) as HTMLButtonElement | null;
                                      if (btn) {
                                        btn.disabled = true;
                                        btn.textContent = "Préparation...";
                                      }
                                      await pdfLib.exportRespondentPdf(
                                        selectedResortKey,
                                        row,
                                      );
                                      if (btn) btn.textContent = "Téléchargé";
                                      setTimeout(() => {
                                        if (btn) {
                                          btn.textContent = "PDF";
                                          btn.disabled = false;
                                        }
                                      }, 2000);
                                    } catch (e) {
                                      console.error(
                                        "Export respondent failed",
                                        e,
                                      );
                                      try {
                                        toast({
                                          title: "Échec de l'export PDF",
                                          description: String(
                                            e && (e.message || e),
                                          ),
                                        });
                                      } catch (_) {}
                                      const btn = document.getElementById(
                                        "export-single-btn-" + i,
                                      ) as HTMLButtonElement | null;
                                      if (btn) {
                                        btn.textContent = "Erreur";
                                        setTimeout(() => {
                                          if (btn) {
                                            btn.textContent = "PDF";
                                            btn.disabled = false;
                                          }
                                        }, 2000);
                                      }
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
                                Math.ceil(data.total / data.pageSize),
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

                        {/* Quick jump input */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm">Aller à</label>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(
                              1,
                              Math.ceil(data.total / data.pageSize),
                            )}
                            value={gotoPage}
                            onChange={(e) => setGotoPage(e.target.value)}
                            className="w-20 rounded-md border px-2 py-1 text-sm"
                            placeholder="n° page"
                          />
                          <button
                            onClick={() => {
                              const totalPages = Math.max(
                                1,
                                Math.ceil(data.total / data.pageSize),
                              );
                              const target = Number(gotoPage) || 1;
                              const clamped = Math.min(
                                Math.max(1, Math.floor(target)),
                                totalPages,
                              );
                              setPage(clamped);
                            }}
                            className="px-3 py-1 border rounded"
                          >
                            Aller
                          </button>

                          {/* Quick page 10 shortcut if available */}
                          {Math.max(1, Math.ceil(data.total / data.pageSize)) >=
                            10 && (
                            <button
                              onClick={() =>
                                setPage(
                                  Math.min(
                                    10,
                                    Math.max(
                                      1,
                                      Math.ceil(data.total / data.pageSize),
                                    ),
                                  ),
                                )
                              }
                              className="px-3 py-1 border rounded"
                            >
                              Page 10
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
              {
                // Resolve the displayed row by looking up the latest row in the current page by key.
                // This prevents mismatches when React reuses DOM nodes or data updates reorder items.
              }
              <DialogTitle>
                {(() => {
                  const key = getRowKey(selected);
                  const live = ((data && (data as any).items) || []).find(
                    (r: any) => getRowKey(r) === key,
                  );
                  const rowToShow = live || selected;
                  // Prefer the exact name the user clicked (snapshot) to avoid mismatches
                  return (
                    selectedSnapshotName ||
                    rowToShow?.name ||
                    rowToShow?.label ||
                    rowToShow?.email ||
                    "Anonyme"
                  );
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
                            const fromMap = key
                              ? (respondentNotesMap as any)[key]
                              : null;
                            if (fromMap) return `${formatAverage(fromMap)}/5`;
                            if (averages && (averages as any).overallAverage)
                              return `${formatAverage((averages as any).overallAverage)}/5`;
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
                          Aucune donnée de catégories trouvée pour ce répondant.
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
                                  const isNameCategory =
                                    c.name &&
                                    nameKeys.test(String(c.name).trim());
                                  if (isNameCategory) {
                                    return (
                                      selectedSnapshotName ||
                                      selected?.name ||
                                      selected?.label ||
                                      selected?.email ||
                                      "—"
                                    );
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
