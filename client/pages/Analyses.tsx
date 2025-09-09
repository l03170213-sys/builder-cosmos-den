import React from "react";
import ChartOnly from "@/components/ChartOnly";
import { useQuery } from "@tanstack/react-query";
import type { ResortAveragesResponse } from "@shared/api";

export default function Analyses() {
  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages-analyses"],
    queryFn: async () => {
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
        const selected = window.localStorage.getItem('selectedResort') || 'vm-resort-albanie';
        const url = new URL(`/api/resort/${selected}/averages`, window.location.origin).toString();
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) {
          const text = await r.text().catch(() => r.statusText);
          throw new Error(`Server error: ${r.status} ${text}`);
        }
        return (await r.json()) as ResortAveragesResponse;
      } catch (err) {
        try {
          const selected = window.localStorage.getItem('selectedResort') || 'vm-resort-albanie';
          const resorts = (await import('@/lib/resorts')).RESORTS;
          const cfg = resorts.find((r:any) => r.key === selected) || resorts[0];
          const gurl = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?gid=${cfg.gidMatrice || '0'}`;
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
            resort: cfg.name,
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
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {isLoading || !data ? (
        <div className="w-full max-w-6xl animate-pulse h-96 rounded-md bg-gray-200" />
      ) : isError ? (
        <div className="text-sm text-destructive">Impossible de charger les données.</div>
      ) : (
        <div className="w-full max-w-6xl bg-white rounded-md p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Tendances Temporelles - Hotel</h3>
          <ChartOnly data={data.categories} chartType="bar" id="chart-wrapper" />
        </div>
      )}
    </div>
  );
}
