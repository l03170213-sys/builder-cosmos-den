import { ChevronDown } from "lucide-react";
import { RESORTS } from "@/lib/resorts";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import React from "react";
import { loadSettings } from "@/lib/settings";

export default function Header() {
  const { resort, setSelected } = useSelectedResort();
  const current = RESORTS.find((r) => r.key === resort) || RESORTS[0];
  const [settings, setSettings] = React.useState(() => loadSettings());

  React.useEffect(() => {
    // listen to storage changes from other tabs
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <header className="h-16 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-10" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={settings.logoUrl} alt={settings.appName} className="h-8 w-auto object-contain" />
          <div className="text-lg font-semibold">{settings.appName}</div>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <select
              aria-label="Select resort"
              value={resort}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {RESORTS.map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
