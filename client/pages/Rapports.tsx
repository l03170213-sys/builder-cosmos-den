import React from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { exportAllHotels } from "@/components/ExportButton";
import { RESORTS } from "@/lib/resorts";

export default function Rapports() {
  const onExportAllGraphics = async () => {
    try {
      await exportAllHotels({ mode: "graphics" });
      alert("Export des graphiques lancé pour tous les hôtels.");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'export des graphiques pour tous les hôtels.");
    }
  };

  const onExportAllOfficial = async () => {
    try {
      await exportAllHotels({ mode: "official" });
      alert("Export officiel lancé pour tous les hôtels.");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'export officiel pour tous les hôtels.");
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Rapports</h1>
            <div className="space-x-2">
              <button
              onClick={async () => {
                try {
                  await exportAllHotels({ mode: "graphics", preCaptureMs: 5000 });
                  alert("Export des graphiques lancé pour tous les hôtels.");
                } catch (err) {
                  console.error(err);
                  alert("Erreur lors de l'export des graphiques pour tous les hôtels.");
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              Exporter tous les graphiques
            </button>
            <button
              onClick={async () => {
                try {
                  await exportAllHotels({ mode: "official", preCaptureMs: 5000 });
                  alert("Export officiel lancé pour tous les hôtels.");
                } catch (err) {
                  console.error(err);
                  alert("Erreur lors de l'export officiel pour tous les hôtels.");
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-white text-sm"
            >
              Exporter tous (format officiel)
            </button>
            </div>
          </div>

          <div className="bg-white rounded-md p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Cliquez sur un des boutons ci-dessus pour lancer l'export de tous
              les hôtels ({RESORTS.length}). Les fichiers PDF seront téléchargés
              un par un.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
