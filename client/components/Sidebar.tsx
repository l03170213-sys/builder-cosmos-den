import { cn } from "@/lib/utils";
import { BarChart3, LineChart, Users2, FileText, Zap, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/analyses", label: "Analyses", icon: LineChart },
  { to: "/repondants", label: "Répondants", icon: Users2 },
  { to: "/rapports", label: "Rapports", icon: FileText },
  { to: "/automatisation", label: "Automatisation", icon: Zap },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const [settings, setSettings] = React.useState(() => loadSettings());
  React.useEffect(() => {
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="h-16 flex items-center gap-2 px-4 text-white font-semibold tracking-tight">
        <img src={settings.logoUrl} alt={settings.appName} className="h-8 w-8 object-contain rounded" />
        <span>{settings.appName}</span>
      </div>
      <nav className="px-2 py-4 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
