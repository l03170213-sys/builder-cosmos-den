import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { RESORTS } from "@/lib/resorts";
import AutomationRules from "@/components/AutomationRules";

function parseSheetId(url: string) {
  try {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function parseGid(url: string) {
  try {
    const m = url.match(/[?&]gid=(\d+)/);
    return m ? m[1] : "0";
  } catch (e) {
    return "0";
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatResortsArray(arr: typeof RESORTS) {
  const lines = arr.map((r) => `  {\n    key: \"${r.key}\",\n    name: \"${r.name.replace(/\"/g, '\\\"')}\",\n    sheetId: \"${r.sheetId}\",\n    gidMatrice: \"${r.gidMatrice}\",\n  },`);
  return `export const RESORTS = [\n${lines.join("\n\n")}\n];`;
}

export default function Automatisation() {
  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const [hotelName, setHotelName] = useState("");
  const [feuille1, setFeuille1] = useState("");
  const [matrice, setMatrice] = useState("");
  const [generatedSnippet, setGeneratedSnippet] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);
  const [deleteSnippet, setDeleteSnippet] = useState("");
  const [showDeleteFor, setShowDeleteFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onAdd = () => {
    setMessage(null);
    if (!hotelName.trim()) {
      setMessage("Le nom de l'hôtel est requis.");
      return;
    }
    const sheetId = parseSheetId(feuille1) || parseSheetId(matrice);
    if (!sheetId) {
      setMessage("Impossible d'extraire l'ID de feuille depuis l'un des liens.");
      return;
    }
    const gidM = parseGid(matrice) || "0";
    let key = slugify(hotelName);
    if (RESORTS.some((r) => r.key === key)) {
      key = `${key}-${Date.now().toString().slice(-4)}`;
    }

    const snippet = `  {\n    key: \"${key}\",\n    name: \"${hotelName.replace(/\"/g, '\\\"')}\",\n    sheetId: \"${sheetId}\",\n    gidMatrice: \"${gidM}\",\n  },`;

    setGeneratedSnippet(snippet);
    setShowGenerated(true);
  };

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copié au presse-papiers.");
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      setMessage("Échec de la copie.");
    }
  };

  const onPrepareDelete = (key: string) => {
    const remaining = RESORTS.filter((r) => r.key !== key);
    const exportText = formatResortsArray(remaining as any);
    setDeleteSnippet(exportText);
    setShowDeleteFor(key);
    setShowGenerated(false);
    setMessage(null);
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
            <AutomationRules />
            <p className="text-sm text-muted-foreground mb-4">Liste des hôtels et liens vers leur feuille 1 (données répondants) et la feuille matrice moyenne.</p>

            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Nom du nouvel hôtel" className="rounded-md border px-3 py-2 text-sm" />
                <input value={feuille1} onChange={(e) => setFeuille1(e.target.value)} placeholder="Lien Feuille 1 (Google Sheets)" className="rounded-md border px-3 py-2 text-sm" />
                <input value={matrice} onChange={(e) => setMatrice(e.target.value)} placeholder="Lien Feuille Matrice Moyenne" className="rounded-md border px-3 py-2 text-sm" />
              </div>

              <div className="flex items-center gap-2">
                <button onClick={onAdd} className="px-3 py-2 rounded-md border bg-primary text-white">Ajouter l'hôtel</button>
                {showGenerated && (
                  <button onClick={() => onCopy(generatedSnippet)} className="px-3 py-2 rounded-md border text-sm">Copier l'objet</button>
                )}
                {message && <div className="text-sm text-muted-foreground">{message}</div>}
              </div>

              {showGenerated && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Objets à coller dans client/lib/resorts.ts (ajouter dans le tableau RESORTS) :</div>
                  <textarea readOnly value={generatedSnippet} className="w-full h-32 rounded-md border p-2 font-mono text-xs" />
                </div>
              )}

              {showDeleteFor && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Remplacer client/lib/resorts.ts par (après suppression) :</div>
                  <textarea readOnly value={deleteSnippet} className="w-full h-48 rounded-md border p-2 font-mono text-xs" />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => onCopy(deleteSnippet)} className="px-3 py-2 rounded-md border bg-destructive text-white">Copier le fichier mis à jour</button>
                    <button onClick={() => { setShowDeleteFor(null); setDeleteSnippet(""); }} className="px-3 py-2 rounded-md border">Annuler</button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {RESORTS.map((r) => {
                const sheetEditBase = `https://docs.google.com/spreadsheets/d/${r.sheetId}`;
                const sheet1Edit = `${sheetEditBase}/edit#gid=0`;
                const matriceEdit = `${sheetEditBase}/edit#gid=${r.gidMatrice}`;

                return (
                  <div key={r.key} className="flex items-center justify-between border rounded p-3">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {r.sheetId}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => open(sheet1Edit)} className="px-3 py-1 rounded-md border text-sm" title="Ouvrir feuille 1 (édition)">Feuille 1 (��dit)</button>

                      <button onClick={() => open(matriceEdit)} className="px-3 py-1 rounded-md border text-sm bg-primary text-white" title="Ouvrir feuille matrice moyenne (édition)">Matrice Moyenne (édit)</button>

                      <button onClick={() => onPrepareDelete(r.key)} className="px-2 py-1 rounded-md border text-xs bg-destructive text-white" title="Préparer suppression">Supprimer</button>
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
