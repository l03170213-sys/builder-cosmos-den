export const STATIC_RESORTS = [
  {
    key: "vm-resort-albanie",
    name: "VM Resort - Albanie",
    sheetId: "1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os",
    gidMatrice: "1104314362",
  },
  {
    key: "alvor-baia-portugal",
    name: "Hôtel Alvor Baia - Portugal",
    sheetId: "1mm2VGYefOx37T7_h6VZGN6Gt4mtF9njVOS344FaeyR0",
    gidMatrice: "2128033065",
  },
  {
    key: "sineva-park-bulgarie",
    name: "Hôtel Sineva Park - Bulgarie",
    sheetId: "1-AgcmIZD1_1fGHnhyuzIrsAIXcMMMuQ1VefX4JUfdJk",
    gidMatrice: "23222471",
  },
  {
    key: "morenia-croatie",
    name: "Hôtel Morenia - Croatie",
    sheetId: "1YxoVkCX1ArQRO03VR3xhWnXaF8wfWbmfnWVtybUmuNA",
    gidMatrice: "656611228",
  },
  {
    key: "medena-croatie",
    name: "Hôtel Medena - Croatie",
    sheetId: "11HlpPYdVpsT0NeG8nqwHjcgfsEfTlT5MuOTKOviKXgM",
    gidMatrice: "244674372",
  },
  {
    key: "riviera-malte",
    name: "Hôtel Riviera - Malte",
    sheetId: "1N7Sxz0woMSq_ZPsKxhD2ZKQkBD3MS4aogmePxqHk38E",
    gidMatrice: "1279346619",
  },
  {
    key: "top-club-cocoon-salini",
    name: "Hôtel Top club cocoon Salini",
    sheetId: "1CLrIFVirQ8YxBCiLJneK_KqSpM-qsHkmKdbwHXCPABQ",
    gidMatrice: "1170488316",
  },
  {
    key: "aquasun-village-crete",
    name: "Hôtel Aquasun Village - Crête",
    sheetId: "1Df7h7P7TRwomlx2RKHPxPNWzsO5INjqGnUfF1BpWA8w",
    gidMatrice: "1085505154",
  },
  {
    key: "atlantica-oasis-chypre",
    name: "Hôtel Atlantica Oasis - Chypre",
    sheetId: "1GQ6UJXL7eiRU9pDbyzHWC-lQpASUgiJtm52nNqI8KNE",
    gidMatrice: "879100003",
  },
  {
    key: "monchique-portugal",
    name: "Hôtel Monchique - Portugal",
    sheetId: "1LyUJwlEfSEsNkeBOdUOhmXPkY70dkcKkcCF19--y2Dk",
    gidMatrice: "373485969",
  },
  {
    key: "dom-pedro-madeira",
    name: "Hôtel Dom Pedro Madeira - Madère",
    sheetId: "127fqvrErex8BDwkaE2VUugD4WHMn47SPENhrIQCYo-U",
    gidMatrice: "862214363",
  },
  {
    key: "gabbiano-italie",
    name: "Hôtel Gabbiano - Italie",
    sheetId: "1E4vOTv3m7uUuCZ889rvwTXduFThcrRGGsbaJu4aJYks",
    gidMatrice: "358504289",
  },
  {
    key: "albatros-croatie",
    name: "Hôtel Albatros - Croatie",
    sheetId: "1iOXnFYJrr5v6XD7Upu9wsoJlPnBeMQJgcRq0HQVmcto",
    gidMatrice: "524730423",
  },
  {
    key: "delphin-montenegro",
    name: "Hôtel Delphin - Monténégro",
    sheetId: "1ToPI9UtLbTwZrY8pX_4vT71dOPn35ZvOGKlKCNWWctU",
    gidMatrice: "831268452",
  },
  {
    key: "pestana-royal-ocean-madeira",
    name: "Hôtel Pestana Royal Océan - Madère",
    sheetId: "1e47IUWqQv-8Oh5-JJADgu9rfNW_6Iuw_OXzAIdLnBic",
    gidMatrice: "1752837685",
  },
  {
    key: "ariel-cala-dor-majorque",
    name: "Hôtel Ariel Cala d'Or - Majorque",
    sheetId: "12bWFjpJ449YIUMHtV7-W7oggIL78hxjUGiFjGSO8NoA",
    gidMatrice: "578780649",
  },
  {
    key: "h-tel-baia-malva-italie",
    name: "Hôtel Baia Malva - Italie",
    sheetId: "1uq0WpYNgdLokw-XNe-kBSybq6awhdJAp25EDfaBGPcE",
    gidMatrice: "140358848",
  },
];

export const RESORTS = STATIC_RESORTS;

const STORAGE_KEY = "customResorts";

export type Resort = { key: string; name: string; sheetId: string; gidMatrice: string };

export function getStoredResorts(): Resort[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn("Failed to read stored resorts", e);
    return [];
  }
}

export function saveStoredResorts(list: Resort[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("resorts-changed"));
  } catch (e) {
    console.warn("Failed to save stored resorts", e);
  }
}

export function getResorts(): Resort[] {
  const stored = getStoredResorts();
  return [...STATIC_RESORTS, ...stored];
}

export function addResort(resort: Resort) {
  const stored = getStoredResorts();
  // avoid duplicates by key
  if (stored.some((r) => r.key === resort.key)) return;
  stored.push(resort);
  saveStoredResorts(stored);
}

export function removeResort(key: string) {
  const stored = getStoredResorts();
  const remaining = stored.filter((r) => r.key !== key);
  saveStoredResorts(remaining);
}

export function formatResortsArray(arr: Resort[]) {
  const lines = arr.map((r) => `  {\n    key: \"${r.key}\",\n    name: \"${r.name.replace(/\"/g, '\\\"')}\",\n    sheetId: \"${r.sheetId}\",\n    gidMatrice: \"${r.gidMatrice}\",\n  },`);
  return `export const RESORTS = [\n${lines.join("\n\n")}\n];`;
}
