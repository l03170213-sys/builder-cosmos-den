import { useEffect, useState } from "react";
import { RESORTS } from "@/lib/resorts";

const STORAGE_KEY = "selectedResort";

export function getDefaultResort() {
  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
  if (stored) return stored;
  return RESORTS[0].key;
}

export function useSelectedResort() {
  const [resort, setResort] = useState<string>(() => getDefaultResort());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setResort(e.newValue || getDefaultResort());
      }
    }
    function onCustom(e: any) {
      setResort(getDefaultResort());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("resort-change", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("resort-change", onCustom as EventListener);
    };
  }, []);

  function setSelected(key: string) {
    window.localStorage.setItem(STORAGE_KEY, key);
    setResort(key);
    window.dispatchEvent(new CustomEvent("resort-change"));
  }

  return { resort, setSelected };
}
