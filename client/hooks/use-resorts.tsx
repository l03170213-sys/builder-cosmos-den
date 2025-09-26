import { useEffect, useState } from "react";
import React, { useEffect, useState } from "react";
import { getResorts } from "@/lib/resorts";

export default function useResorts() {
  const [resorts, setResorts] = useState(() => getResorts());

  useEffect(() => {
    const onChange = () => setResorts(getResorts());
    window.addEventListener("resorts-changed", onChange as EventListener);
    window.addEventListener("storage", onChange as EventListener);
    return () => {
      window.removeEventListener("resorts-changed", onChange as EventListener);
      window.removeEventListener("storage", onChange as EventListener);
    };
  }, []);

  return resorts;
}
