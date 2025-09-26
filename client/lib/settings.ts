export type EmailProvider = "test-local" | "sendgrid" | "smtp";

export type AppSettings = {
  appName: string;
  logoUrl: string;
  primaryColor: string;
  dateLocale: string;
  timezone: string;
  apiBaseUrl: string;
  refreshIntervalMs: number;
  enableSnapshots: boolean;
  roles: { admin: boolean; editor: boolean; viewer: boolean };

  // New behaviour / export / notification settings
  anonymizePII: boolean;
  enableEmailNotifications: boolean;
  emailProvider: EmailProvider;
  emailFrom?: string;
  defaultReportFormat: "pdf" | "csv";
  scheduledReportsEnabled: boolean;
  scheduledReportsCron: string;
  retentionDays: number;
  maxExportBatch: number;
  autoExportOnSnapshot: boolean;

  // Survey-specific settings
  recommendationThreshold: number; // value 0..1 used to mark 'Basé' thresholds
  removeGarbageChars: boolean; // enable extra sanitization of exported text
  pdfExportDelaySeconds: number; // initial delay per respondent export
  pdfExportRetries: number; // number of retry attempts when fetching respondent details
  exportPreCaptureMs: number; // ms to wait before capturing a page
  exportCanvasScale: number; // scale used by html2canvas during export
  allowedEmailDomains?: string; // comma separated list
  adminContactEmail?: string;
  enableAnalytics?: boolean;
};

const STORAGE_KEY = "vm_app_settings_v1";
const VERSIONS_KEY = "vm_app_settings_versions_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "TRAVELSAT APPLICATION",
  logoUrl: "https://cdn.builder.io/api/v1/image/assets%2Fa55e2b675d8b4a19887bfba4c19f448e%2Fa614d0b1701f4fb3bed1350cab486eb4?format=webp&width=800",
  primaryColor: "#2fb7a8",
  dateLocale: "fr-FR",
  timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris" : "Europe/Paris",
  apiBaseUrl: "/api",
  refreshIntervalMs: 30000,
  enableSnapshots: false,
  roles: { admin: true, editor: false, viewer: false },

  anonymizePII: false,
  enableEmailNotifications: false,
  emailProvider: "test-local",
  emailFrom: "no-reply@example.com",
  defaultReportFormat: "pdf",
  scheduledReportsEnabled: false,
  scheduledReportsCron: "0 6 * * *",
  retentionDays: 365,
  maxExportBatch: 100,
  autoExportOnSnapshot: false,

  // survey-specific defaults
  recommendationThreshold: 0.75,
  removeGarbageChars: true,
  pdfExportDelaySeconds: 1,
  pdfExportRetries: 3,
  exportPreCaptureMs: 1000,
  exportCanvasScale: 1.5,
  allowedEmailDomains: "",
  adminContactEmail: "admin@example.com",
  enableAnalytics: false,
};

type StoredVersion = {
  name: string;
  ts: number; // epoch millis
  settings: AppSettings;
};

export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    applyTheme(s.primaryColor);
  } catch (e) {
    // noop
  }
}

export function resetSettings() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    applyTheme(DEFAULT_SETTINGS.primaryColor);
    return DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function applyTheme(primary: string) {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--vm-primary", primary);
      // also set a tailwind-compatible css variable for utilities if needed
      document.documentElement.style.setProperty("--vm-primary-rgb", hexToRgb(primary));
    }
  } catch (e) {
    // noop
  }
}

function hexToRgb(hex: string) {
  try {
    const h = hex.replace('#', '').trim();
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  } catch (e) {
    return '47, 183, 168';
  }
}

// Versioning helpers
function readVersions(): StoredVersion[] {
  try {
    const raw = window.localStorage.getItem(VERSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredVersion[];
    // basic validation
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => v && v.name && v.ts && v.settings);
  } catch (e) {
    return [];
  }
}

function writeVersions(vs: StoredVersion[]) {
  try {
    window.localStorage.setItem(VERSIONS_KEY, JSON.stringify(vs));
  } catch (e) {
    // noop
  }
}

export function listVersions(): { name: string; ts: number }[] {
  return readVersions().map(v => ({ name: v.name, ts: v.ts })).sort((a,b)=>b.ts-a.ts);
}

export function saveVersion(name: string, s?: AppSettings) {
  try {
    const settings = s || loadSettings();
    const vs = readVersions();
    const existing = vs.findIndex(v => v.name === name);
    const entry: StoredVersion = { name, ts: Date.now(), settings };
    if (existing >= 0) {
      vs[existing] = entry;
    } else {
      vs.push(entry);
    }
    // keep at most 50 versions
    const trimmed = vs.slice(-50);
    writeVersions(trimmed);
  } catch (e) {
    // noop
  }
}

export function loadVersion(name: string): AppSettings | null {
  try {
    const vs = readVersions();
    const found = vs.find(v => v.name === name);
    return found ? found.settings : null;
  } catch (e) {
    return null;
  }
}

export function removeVersion(name: string) {
  try {
    const vs = readVersions().filter(v => v.name !== name);
    writeVersions(vs);
  } catch (e) {
    // noop
  }
}

export function applyVersion(name: string): AppSettings | null {
  try {
    const s = loadVersion(name);
    if (!s) return null;
    saveSettings(s);
    return s;
  } catch (e) {
    return null;
  }
}
