import React from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, LineChart, Users2, FileText, Zap, Settings } from "lucide-react";
import { loadSettings } from "@/lib/settings";
import { useMobileNav } from "@/components/MobileNavProvider";

const items = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/analyses", label: "Analyses", icon: LineChart },
  { to: "/repondants", label: "Répondants", icon: Users2 },
  { to: "/rapports", label: "Rapports", icon: FileText },
  { to: "/automatisation", label: "Automatisation", icon: Zap },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];

// Local class joiner to avoid bundle identifier collisions
const cx = (...args: any[]) => args.filter(Boolean).join(" ");

export function Sidebar() {
  const [settings, setSettings] = React.useState(() => loadSettings());
  React.useEffect(() => {
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const mobile = (() => {
    try {
      return useMobileNav();
    } catch (e) {
      return null;
    }
  })();

  const content = (
    <div
      className="flex flex-col w-64 shrink-0 border-r"
      style={{ backgroundColor: "white", color: "var(--vm-primary)", borderColor: "rgba(0,0,0,0.06)" }}
    >
      <div className="h-20 flex items-center gap-2 px-4 font-semibold tracking-tight">
        <img src={settings.logoUrl} alt={settings.appName} className="h-16 w-auto object-contain rounded" />
      </div>

      <nav className="px-2 py-4 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                isActive ? "bg-primary text-white" : "text-primary hover:bg-primary hover:text-white",
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );

  if (!mobile) {
    return <aside className="hidden md:flex md:flex-col">{content}</aside>;
  }

  return (
    <>
      <aside className="hidden md:flex md:flex-col">{content}</aside>
      {mobile.open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => mobile?.setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            {content}
            <div className="p-4">
              <button className="px-3 py-2 rounded bg-gray-100" onClick={() => mobile?.setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
