import { useEffect, useState } from "react";

export function useChartType(defaultType: "bar" | "line" = "bar") {
  const [type, setType] = useState(defaultType);

  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<string>).detail as "bar" | "line";
      if (val) setType(val);
    };
    window.addEventListener("chart-type-change", handler as EventListener);
    return () => window.removeEventListener("chart-type-change", handler as EventListener);
  }, []);

  return type;
}
