import { ChevronDown } from "lucide-react";
import { RESORTS } from "@/lib/resorts";
import { useSelectedResort } from "@/hooks/use-selected-resort";

export default function Header() {
  const { resort, setSelected } = useSelectedResort();
  const current = RESORTS.find((r) => r.key === resort) || RESORTS[0];

  return (
    <header className="h-16 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-10">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">HotelSat</h1>
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
