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
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Rapports</h1>
          <div className="space-x-2">
            <button
              onClick={onExportAllGraphics}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              Exporter tous les graphiques
            </button>
            <button
              onClick={onExportAllOfficial}
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
      </div>
    </div>
  );
}
