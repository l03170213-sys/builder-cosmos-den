import * as React from "react";
import { loadAutomations, addAutomation, updateAutomation, removeAutomation, AutomationRule } from "@/lib/automations";

export default function AutomationRules() {
  const [rules, setRules] = React.useState<AutomationRule[]>(() => loadAutomations());
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AutomationRule["type"]>("webhook");
  const [config, setConfig] = React.useState("{}");

  React.useEffect(() => {
    setRules(loadAutomations());
  }, []);

  const onAdd = () => {
    if (!name.trim()) return alert('Nom requis');
    let parsed = {};
    try { parsed = JSON.parse(config || "{}"); } catch (e) { return alert('Config JSON invalide'); }
    addAutomation({ name: name.trim(), type, enabled: true, config: parsed });
    setRules(loadAutomations());
    setName(""); setConfig("{}"); setType("webhook");
  };

  const onToggle = (r: AutomationRule) => {
    updateAutomation(r.id, { enabled: !r.enabled });
    setRules(loadAutomations());
  };

  const onDelete = (r: AutomationRule) => {
    if (!confirm(`Supprimer la règle ${r.name} ?`)) return;
    removeAutomation(r.id);
    setRules(loadAutomations());
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-lg font-semibold mb-2">Automatisations & Règles</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la règle" className="rounded-md border px-3 py-2" />
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded-md border px-3 py-2">
          <option value="webhook">Webhook</option>
          <option value="schedule">Planifié (cron)</option>
          <option value="alert">Alerte</option>
        </select>
        <input value={config} onChange={(e) => setConfig(e.target.value)} placeholder='Config JSON (ex: {"url":"https://..."})' className="rounded-md border px-3 py-2 col-span-2" />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onAdd} className="px-3 py-2 rounded-md bg-primary text-white">Ajouter règle</button>
        <div className="text-sm text-muted-foreground">Les règles sont stockées localement. Connectez un MCP pour exécution serveur.</div>
      </div>

      <div className="space-y-2">
        {rules.length === 0 && <div className="text-sm text-muted-foreground">Aucune règle</div>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.type} • créé {new Date(r.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={r.enabled} onChange={() => onToggle(r)} /> Activé</label>
              <button onClick={() => onDelete(r)} className="px-2 py-1 rounded-md border bg-destructive text-white text-xs">Suppr</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
