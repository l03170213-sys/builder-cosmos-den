import { useEffect, useState } from "react";

export type ChartType = "bar" | "line" | "pie" | "radar";

export function useChartType(defaultType: ChartType = "bar") {
  const [type, setType] = useState<ChartType>(defaultType);

  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<string>).detail as ChartType;
      if (val) setType(val);
    };
    window.addEventListener("chart-type-change", handler as EventListener);
    return () => window.removeEventListener("chart-type-change", handler as EventListener);
  }, []);

  return type;
}
