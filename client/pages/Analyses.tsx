import React from "react";
import ChartOnly from "@/components/ChartOnly";
import { useQuery } from "@tanstack/react-query";
import type { ResortAveragesResponse } from "@shared/api";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import { RESORTS } from "@/lib/resorts";
import { safeFetch } from "@/lib/fetcher";

export default function Analyses() {
  const { resort: selectedResortKey } = useSelectedResort();
  const currentResort =
    RESORTS.find((r) => r.key === selectedResortKey) || RESORTS[0];

  const { data, isLoading, isError } = useQuery<ResortAveragesResponse>({
    queryKey: ["resort-averages-analyses", selectedResortKey],
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
        console.error("API fetch failed:", err);
        throw err;
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
        <div className="text-sm text-destructive">
          Impossible de charger les données.
        </div>
      ) : (
        <div className="w-full max-w-6xl bg-white rounded-md p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">
            Tendances Temporelles - Hotel
          </h3>
          <ChartOnly
            data={data.categories}
            chartType="bar"
            id="chart-wrapper"
          />
        </div>
      )}
    </div>
  );
}
