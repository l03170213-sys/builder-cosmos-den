export type AutomationRule = {
  id: string;
  type: "webhook" | "schedule" | "alert";
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: string;
};

const STORAGE_KEY = "vm_automations_v1";

export function loadAutomations(): AutomationRule[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AutomationRule[];
  } catch (e) {
    return [];
  }
}

export function saveAutomations(rules: AutomationRule[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (e) {
    // noop
  }
}

export function addAutomation(rule: Omit<AutomationRule, "id" | "createdAt">) {
  const rules = loadAutomations();
  const id = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const item: AutomationRule = { ...rule, id, createdAt: new Date().toISOString() };
  const next = [item, ...rules];
  saveAutomations(next);
  return item;
}

export function updateAutomation(id: string, patch: Partial<AutomationRule>) {
  const rules = loadAutomations();
  const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveAutomations(next);
  return next;
}

export function removeAutomation(id: string) {
  const rules = loadAutomations();
  const next = rules.filter((r) => r.id !== id);
  saveAutomations(next);
  return next;
}
