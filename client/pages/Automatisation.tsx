import React, { useState } from "react";
import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import useResorts from "@/hooks/use-resorts";
import { getResorts, addResort, removeResort, formatResortsArray, STATIC_RESORTS } from "@/lib/resorts";
import { useSelectedResort } from "@/hooks/use-selected-resort";

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

export default function Automatisation() {
  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const resorts = useResorts();
  const { setSelected } = useSelectedResort();

  const [hotelName, setHotelName] = useState("");
  const [feuille1, setFeuille1] = useState("");
  const [matrice, setMatrice] = useState("");
  const [generatedSnippet, setGeneratedSnippet] = useState("");
  const [showGenerated, setShowGenerated] = useState(false);
  const [deleteSnippet, setDeleteSnippet] = useState("");
  const [showDeleteFor, setShowDeleteFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onAdd = () => {
    // Persist the resort immediately and rely on useResorts to update UI
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
    const existing = getResorts();
    if (existing.some((r) => r.key === key)) {
      key = `${key}-${Date.now().toString().slice(-4)}`;
    }

    const resortObj = { key, name: hotelName.trim(), sheetId, gidMatrice: gidM };
    try {
      addResort(resortObj as any);
      setGeneratedSnippet(`  {\n    key: "${resortObj.key}",\n    name: "${resortObj.name.replace(/\"/g, '\\\"')}",\n    sheetId: "${resortObj.sheetId}",\n    gidMatrice: "${resortObj.gidMatrice}",\n  },`);
      setShowGenerated(true);
      setMessage("Hôtel ajouté et enregistré localement.");
      setHotelName(""); setFeuille1(""); setMatrice("");
      // select the newly added resort so UI refreshes and queries run
      try { setSelected(resortObj.key); } catch (e) {}
      setTimeout(() => setMessage(null), 2500);
    } catch (e) {
      console.error(e);
      setMessage("Erreur lors de l'ajout de l'hôtel.");
    }
  };

  const onSaveLocal = () => {
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
    const existing = getResorts();
    if (existing.some((r) => r.key === key)) {
      key = `${key}-${Date.now().toString().slice(-4)}`;
    }
    const resortObj = { key, name: hotelName.trim(), sheetId, gidMatrice: gidM };
    try {
      addResort(resortObj as any);
      setMessage("Hôtel ajouté et enregistré localement.");
      setHotelName(""); setFeuille1(""); setMatrice("");
      setTimeout(() => setMessage(null), 2500);
    } catch (e) {
      console.error(e);
      setMessage("Erreur lors de l'ajout de l'hôtel.");
    }
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
    const all = getResorts();
    const isStatic = STATIC_RESORTS.some((r) => r.key === key);
    if (isStatic) {
      const remaining = STATIC_RESORTS.filter((r) => r.key !== key);
      const exportText = formatResortsArray(remaining as any);
      setDeleteSnippet(exportText);
      setShowDeleteFor(key);
      setShowGenerated(false);
      setMessage(null);
    } else {
      // stored (local) resort -> remove directly after confirmation
      if (confirm("Supprimer cet hôtel ajouté localement ?")) {
        removeResort(key);
        setMessage("Hôtel supprimé localement.");
        setShowDeleteFor(null);
        setTimeout(() => setMessage(null), 2000);
      }
    }
  };

  const generateScriptForResort = (r: any) => {
    // Returns a Google Apps Script (to paste into Extensions > Apps Script for the Google Sheet)
    return `// Script généré pour le document: ${'${r.name}'}\n\nfunction declencheurPrincipal(e) {\n  const ss = SpreadsheetApp.getActiveSpreadsheet();\n  const feuilleActive = ss.getActiveSheet();\n  const nomFeuilleSource = "Feuille 1";\n\n  if (feuilleActive.getName() !== nomFeuilleSource) {\n    return; // Évite les boucles infinies\n  }\n\n  remplacerBooleensParOuiNon(feuilleActive);\n\n  // --- Suppression des lignes vides dans D:BT ---\n  supprimerLignesVidesDansPlage(ss.getSheetByName("Feuille 1"), "D", "BT");\n  supprimerLignesVidesDansPlage(ss.getSheetByName("Matrice Moyennes"), "D", "BT");\n\n  creerOuMettreAJourMatriceMoyennes();\n  creerOuMettreAJourGraphiques();\n}\n\nfunction remplacerBooleensParOuiNon(feuille) {\n  const plage = feuille.getDataRange();\n  const valeurs = plage.getValues();\n\n  for (let i = 0; i < valeurs.length; i++) {\n    for (let j = 0; j < valeurs[i].length; j++) {\n      if (valeurs[i][j] === true) {\n        valeurs[i][j] = "OUI";\n      } else if (valeurs[i][j] === false) {\n        valeurs[i][j] = "NON";\n      }\n    }\n  }\n  plage.setValues(valeurs);\n}\n\nfunction supprimerLignesVidesDansPlage(sheet, colStart, colEnd) {\n  if (!sheet || sheet.getLastRow() < 2) return;\n\n  const lastRow = sheet.getLastRow();\n  const range = sheet.getRange(colStart + "2:" + colEnd + lastRow);\n  const values = range.getValues();\n  const rowsToDelete = [];\n\n  for (let i = 0; i < values.length; i++) {\n    const row = values[i];\n    const isEmpty = row.every(cell => cell === "" || cell === null);\n    if (isEmpty) {\n      const rowIndex = i + 2;\n      const cellValue = sheet.getRange(rowIndex, 1).getValue();\n      if (cellValue !== "MOYENNE GLOBALE") {\n        rowsToDelete.push(rowIndex);\n      }\n    }\n  }\n\n  rowsToDelete.reverse().forEach(r => sheet.deleteRow(r));\n}\n\nfunction creerOuMettreAJourMatriceMoyennes() {\n  const ss = SpreadsheetApp.getActiveSpreadsheet();\n  const feuilleSource = ss.getSheetByName("Feuille 1");\n  if (!feuilleSource || feuilleSource.getLastRow() < 2) return;\n\n  const donnees = feuilleSource.getDataRange().getValues();\n  const headers = donnees[0];\n\n  const categories = {\n    "🌟 APPRÉCIATION GLOBALE": ["Conformité Prestations / Brochures", "Rapport Qualité / Prix", "Appréciation globale des vacances"],\n    "✈️ TRANSPORTS Aérien": ["Accueil / Confort", "Ponctualité", "Sécurité"],\n    "🚐 Car navette": ["Prestation du conducteur", "Confort et propreté"],\n    "🏨 HÉBERGEMENT": ["Accueil", "Cadre des restaurants", "Cadre et environnement", "Propreté des parties communes", "Qualité et variété des plats"],\n    "🛏️ CHAMBRES": ["Propreté", "Confort", "Taille", "Salle de bains"],\n    "🏊 PISCINE": ["Aménagements", "Hygiène", "Sécurité"],\n    "🎉 ANIMATION": ["Qualité des équipements sportifs", "Animation en soirée", "Variété des activités", "Convivialité Équipe d’Animation", "Activités pour enfants", "Animation en journée"],\n    "👥 ÉQUIPES": ["Aéroport arrivée", "Aéroport départ", "Réunion d’information", "Présence et convivialité", "Anticipation des besoins", "Réactivité et solutions apportées"],\n    "🤝 Représentant Top of Travel": ["Réunion d’information", "Présence et convivialité", "Anticipation des besoins", "Réactivité et solutions apportées"],\n    "🌍 EXCURSIONS": ["Qualité", "Moyens de transport", "Guides locaux", "Restauration"]\n  };\n\n  let resultSheet = ss.getSheetByName("Matrice Moyennes");\n  if (!resultSheet) {\n    resultSheet = ss.insertSheet("Matrice Moyennes", 2);\n  }\n  resultSheet.clear();\n\n  const nomColIndex = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().includes("nom"));\n  const resultats = [];\n  const entete = ["Nom", ...Object.keys(categories), "MOYENNE GÉNÉRALE"];\n  resultats.push(entete);\n\n  donnees.slice(1).forEach(row => {\n    const nom = nomColIndex >= 0 && row[nomColIndex] ? String(row[nomColIndex]).trim() : "Anonyme";\n    const resultatLigne = [nom];\n    let totalLigne = 0, countLigne = 0;\n\n    for (const cat in categories) {\n      let sommeCat = 0, countCat = 0;\n      categories[cat].forEach(titre => {\n        headers.forEach((h, idx) => {\n          if (h === titre) {\n            const raw = row[idx];\n            const val = raw === "" || raw === null ? NaN : parseFloat(String(raw).replace(',', '.'));
            if (!isNaN(val)) { sommeCat += val; countCat++; }\n          }\n        });\n      });\n      const moyCat = countCat ? (sommeCat / countCat) : "";\n      resultatLigne.push(moyCat);\n      if (moyCat !== "") { totalLigne += moyCat; countLigne++; }\n    }\n    resultatLigne.push(countLigne ? (totalLigne / countLigne) : "");\n    resultats.push(resultatLigne);\n  });\n\n  const ligneGlob = ["MOYENNE GLOBALE"];\n  let totalGeneral = 0, countGeneral = 0;\n  for (let j = 1; j < entete.length - 1; j++) {\n    let sommeCol = 0, countCol = 0;\n    for (let i = 1; i < resultats.length; i++) {\n      const val = resultats[i][j];\n      if (typeof val === 'number') { sommeCol += val; countCol++; }\n    }\n    const moyCol = countCol ? (sommeCol / countCol) : "";\n    ligneGlob.push(moyCol);\n    if (moyCol !== "") { totalGeneral += moyCol; countGeneral++; }\n  }\n  ligneGlob.push(countGeneral ? (totalGeneral / countGeneral) : "");\n  resultats.push(ligneGlob);\n\n  resultSheet.getRange(1, 1, resultats.length, entete.length).setValues(resultats).setNumberFormat("0.00");\n  resultSheet.getRange(1, 1, 1, entete.length).setFontWeight("bold");\n  resultSheet.getRange(resultats.length, 1, 1, entete.length).setFontWeight("bold");\n  resultSheet.getRange(1, 1, resultats.length, 1).setFontWeight("bold");\n  resultSheet.getRange(1, entete.length, resultats.length, 1).setFontWeight("bold");\n  resultSheet.setFrozenRows(1);\n  resultSheet.autoResizeColumns(1, entete.length);\n\n  supprimerLignesVidesDansPlage(resultSheet, "D", "BT");\n}\n\nfunction creerOuMettreAJourGraphiques() {\n  const ss = SpreadsheetApp.getActiveSpreadsheet();\n  const sourceSheet = ss.getSheetByName("Matrice Moyennes");\n  if (!sourceSheet || sourceSheet.getLastRow() < 3) return;\n\n  let chartSheet = ss.getSheetByName("Graphiques");\n  if (!chartSheet) {\n    chartSheet = ss.insertSheet("Graphiques", 3);\n  } else {\n    chartSheet.getCharts().forEach(chart => chartSheet.removeChart(chart));\n    chartSheet.clear();\n  }\n\n  const nbColonnes = sourceSheet.getLastColumn();\n  const nbLignes = sourceSheet.getLastRow();\n\n  const categoriesHeaders = sourceSheet.getRange(1, 2, 1, nbColonnes - 2).getValues()[0];\n  const globalValues = sourceSheet.getRange(nbLignes, 2, 1, nbColonnes - 2).getValues()[0];\n\n  const tableData = [["Catégorie", "Moyenne Globale"]];\n  for (let i = 0; i < categoriesHeaders.length; i++) {\n    tableData.push([categoriesHeaders[i], globalValues[i]]);\n  }\n  chartSheet.getRange(1, 1, tableData.length, tableData[0].length).setValues(tableData);\n\n  const dataRangeForChart1 = chartSheet.getRange(1, 1, tableData.length, tableData[0].length);\n  const chart1 = chartSheet.newChart()\n    .setChartType(Charts.ChartType.COLUMN)\n    .addRange(dataRangeForChart1)\n    .setOption("title", "📊 Moyenne Globale par Catégorie")\n    .setOption("legend", { position: "right" })\n    .setOption("hAxis", { title: "Catégories" })\n    .setOption("vAxis", { title: "Note Moyenne", viewWindow: { min: 0 } })\n    .setPosition(5, 1, 0, 0)\n    .build();\n  chartSheet.insertChart(chart1);\n\n  const nbPersonnes = nbLignes - 2;\n  if (nbPersonnes > 0) {\n    const rangePersonnes = sourceSheet.getRange(2, 1, nbPersonnes, 2);\n    const chart2 = chartSheet.newChart()\n      .setChartType(Charts.ChartType.BAR)\n      .addRange(rangePersonnes)\n      .setOption("title", "📈 Moyenne Générale par Personne")\n      .setOption("legend", { position: "none" })\n      .setOption("colors", ["#43a047"])\n      .setOption("hAxis", { title: "Note Moyenne", viewWindow: { min: 0 } })\n      .setOption("vAxis", { title: "Participants" })\n      .setPosition(20, 1, 0, 0)\n      .build();\n    chartSheet.insertChart(chart2);\n  }\n\n  const moyenneGenerale = sourceSheet.getRange(nbLignes, nbColonnes).getValue();\n  const cellTexte = chartSheet.getRange("J5");\n  const cellValeur = chartSheet.getRange("J6");\n\n  cellTexte.setValue("MOYENNE GÉNÉRALE");\n  cellTexte.setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");\n\n  cellValeur.setValue(moyenneGenerale).setNumberFormat("0.00");\n  cellValeur.setFontWeight("bold").setFontSize(14).setFontColor("blue").setHorizontalAlignment("center");\n}\n`;
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

            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder="Nom du nouvel hôtel" className="rounded-md border px-3 py-2 text-sm" />
                <input value={feuille1} onChange={(e) => setFeuille1(e.target.value)} placeholder="Lien Feuille 1 (Google Sheets)" className="rounded-md border px-3 py-2 text-sm" />
                <input value={matrice} onChange={(e) => setMatrice(e.target.value)} placeholder="Lien Feuille Matrice Moyenne" className="rounded-md border px-3 py-2 text-sm" />
              </div>

              <div className="flex items-center gap-2">
                <button onClick={onAdd} className="px-3 py-2 rounded-md border bg-primary text-white">Ajouter l'hôtel</button>
                <button onClick={onSaveLocal} className="px-3 py-2 rounded-md border text-sm">Enregistrer localement</button>
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
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => {
                    const allScripts = resorts.map((r) => generateScriptForResort(r)).join('\n\n// -------------------------\n\n');
                    navigator.clipboard.writeText(allScripts).then(() => setMessage('Script Apps Script copié pour tous les hôtels.'), () => setMessage('Échec de la copie.'));
                    setTimeout(() => setMessage(null), 2500);
                  }}
                  className="px-3 py-2 rounded-md border text-sm bg-primary text-white"
                >
                  Copier Apps Script pour tous
                </button>

                <a href="https://developers.google.com/apps-script/guides/sheets" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground">Guide Apps Script</a>
              </div>

              {resorts.map((r) => {
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
                      <button onClick={() => open(sheet1Edit)} className="px-3 py-1 rounded-md border text-sm" title="Ouvrir feuille 1 (édition)">Feuille 1 (édit)</button>

                      <button onClick={() => open(matriceEdit)} className="px-3 py-1 rounded-md border text-sm bg-primary text-white" title="Ouvrir feuille matrice moyenne (édition)">Matrice Moyenne (édit)</button>

                      <button
                        onClick={() => {
                          const script = generateScriptForResort(r);
                          navigator.clipboard.writeText(script).then(() => setMessage('Script Apps Script copié pour ' + r.name + '.'), () => setMessage('Échec de la copie.'));
                          setTimeout(() => setMessage(null), 2500);
                        }}
                        className="px-3 py-1 rounded-md border text-sm"
                        title="Copier Apps Script pour ce document"
                      >
                        Copier Apps Script
                      </button>

                      <button onClick={() => onPrepareDelete(r.key)} className="px-3 py-1 rounded-md border text-xs bg-destructive text-white" title="Préparer suppression">Supprimer</button>
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
