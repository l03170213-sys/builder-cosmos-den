import { ChevronDown } from "lucide-react";
import { getResorts } from "@/lib/resorts";
import useResorts from "@/hooks/use-resorts";
import { useSelectedResort } from "@/hooks/use-selected-resort";
import React from "react";
import { loadSettings } from "@/lib/settings";

import { Menu } from "lucide-react";
import { useMobileNav } from "@/components/MobileNavProvider";

export default function Header() {
  const { resort, setSelected } = useSelectedResort();
  const resorts = useResorts();
  const current = resorts.find((r) => r.key === resort) ||
    resorts[0] || { name: "VM Resort" };
  const [settings, setSettings] = React.useState(() => loadSettings());
  const mobile = useMobileNav();

  React.useEffect(() => {
    // listen to storage changes from other tabs
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <header
      className="h-20 border-b sticky top-0 z-10"
      style={{
        backgroundColor: "white",
        color: "var(--vm-primary)",
        borderColor: "rgba(0,0,0,0.05)",
      }}
    >
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md"
            aria-label="Toggle menu"
            onClick={() => mobile?.toggle()}
          >
            <Menu className="h-6 w-6" />
          </button>

          <img
            src={settings.logoUrl}
            alt={settings.appName}
            className="h-8 w-auto rounded"
          />
          <div
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: "var(--vm-primary)" }}
          >
            {settings.appName}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <select
              aria-label="Select resort"
              value={resort}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--vm-primary)",
                color: "white",
                border: "1px solid rgba(0,0,0,0.08)",
              }}
            >
              {resorts.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
