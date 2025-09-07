import { ChevronDown } from "lucide-react";

export default function Header() {
  return (
    <header className="h-16 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-10">
      <div className="h-full max-w-screen-2xl mx-auto px-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">HotelSat</h1>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            VM Resort - Albanie
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
