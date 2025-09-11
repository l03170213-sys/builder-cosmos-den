import React from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { RESORTS } from "@/lib/resorts";

export default function Automatisation() {
  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      // noop
    });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Automatisation</h1>
            <div className="text-sm text-muted-foreground">Accès rapide aux feuilles Google Sheets</div>
          </div>

          <div className="bg-white rounded-md p-4 shadow-sm">
            <p className="text-sm text-muted-foreground mb-4">Liste des hôtels et liens vers leur feuille 1 (données répondants) et la feuille matrice moyenne.</p>

            <div className="space-y-3">
              {RESORTS.map((r) => {
                const sheetEditBase = `https://docs.google.com/spreadsheets/d/${r.sheetId}`;
                const sheet1Edit = `${sheetEditBase}/edit#gid=0`;
                const matriceEdit = `${sheetEditBase}/edit#gid=${r.gidMatrice}`;
                const sheet1Gviz = `https://docs.google.com/spreadsheets/d/${r.sheetId}/gviz/tq`;
                const matriceGviz = `https://docs.google.com/spreadsheets/d/${r.sheetId}/gviz/tq?gid=${r.gidMatrice}`;

                return (
                  <div key={r.key} className="flex items-center justify-between border rounded p-3">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {r.sheetId}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => open(sheet1Edit)}
                        className="px-3 py-1 rounded-md border text-sm"
                        title="Ouvrir feuille 1 (édition)"
                      >
                        Feuille 1 (édit)
                      </button>

                      <button
                        onClick={() => open(matriceEdit)}
                        className="px-3 py-1 rounded-md border text-sm bg-primary text-white"
                        title="Ouvrir feuille matrice moyenne (édition)"
                      >
                        Matrice Moyenne (édit)
                      </button>

                      <button
                        onClick={() => copy(sheet1Gviz)}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Copier URL gviz feuille 1"
                      >
                        Copier gviz 1
                      </button>

                      <button
                        onClick={() => copy(matriceGviz)}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Copier URL gviz matrice"
                      >
                        Copier gviz matrice
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
