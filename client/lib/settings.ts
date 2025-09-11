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
};

const STORAGE_KEY = "vm_app_settings_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "HotelSat",
  logoUrl:
    "https://cdn.builder.io/api/v1/image/assets%2Fa55e2b675d8b4a19887bfba4c19f448e%2F142a950cbd354f64852a8bf881630483?format=webp&width=800",
  primaryColor: "#2fb7a8",
  dateLocale: "fr-FR",
  timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris" : "Europe/Paris",
  apiBaseUrl: "/api",
  refreshIntervalMs: 30000,
  enableSnapshots: false,
  roles: { admin: true, editor: false, viewer: false },
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
