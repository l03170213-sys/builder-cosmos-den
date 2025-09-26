import React from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { exportAllHotels } from "@/components/ExportButton";
import useResorts from "@/hooks/use-resorts";

export default function Rapports() {
  const [exporting, setExporting] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState(0);
  const [exportTotal, setExportTotal] = React.useState(0);
  const [exportCurrentKey, setExportCurrentKey] = React.useState<string | null>(null);
  const [waiting, setWaiting] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number>(0);

  const runExportWithCountdown = async (mode: "graphics" | "official") => {
    try {
      // Start waiting period of 120s
      setWaiting(true);
      setCountdown(120);
      await new Promise<void>((resolve) => {
        const iv = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(iv);
              resolve();
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      });
      setWaiting(false);

      // Start export
      setExporting(true);
      setExportProgress(0);
      const resorts = useResorts();
      setExportTotal(resorts.length);
      await exportAllHotels({ mode, preCaptureMs: 1000, onProgress: (done, total, key) => {
        setExportProgress(done);
        setExportTotal(total);
        setExportCurrentKey(key || null);
      }});

      if (mode === "graphics") alert("Export des graphiques terminé pour tous les hôtels.");
      else alert("Export officiel terminé pour tous les hôtels.");
    } catch (err) {
      console.error(err);
      if (mode === "graphics") alert("Erreur lors de l'export des graphiques pour tous les hôtels.");
      else alert("Erreur lors de l'export officiel pour tous les hôtels.");
    } finally {
      setExporting(false);
      setWaiting(false);
      setTimeout(() => { setExportProgress(0); setExportTotal(0); setExportCurrentKey(null); }, 1500);
    }
  };

  const onExportAllGraphics = async () => runExportWithCountdown("graphics");
  const onExportAllOfficial = async () => runExportWithCountdown("official");

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
              les hôtels ({getResorts().length}). Les fichiers PDF seront téléchargés
              un par un.
            </p>
          </div>

          {exporting && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white p-6 rounded shadow max-w-md w-full">
                <h3 className="text-lg font-semibold mb-2">Export en cours</h3>
                <div className="text-sm text-muted-foreground mb-4">{exportCurrentKey ? `Hôtel: ${exportCurrentKey}` : "Préparation..."}</div>
                <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
                  <div className="bg-primary h-3" style={{ width: `${exportTotal ? Math.round((exportProgress / exportTotal) * 100) : 0}%` }} />
                </div>
                <div className="text-sm text-muted-foreground mt-2">{exportProgress} / {exportTotal}</div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
