import React from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { loadSettings, saveSettings, resetSettings, DEFAULT_SETTINGS, AppSettings } from "@/lib/settings";
import ManageUsers from "@/components/ManageUsers";

export default function Parametres() {
  const [settings, setSettings] = React.useState<AppSettings>(() => loadSettings());
  const [status, setStatus] = React.useState<string | null>(null);
  const [showUsers, setShowUsers] = React.useState(false);

  React.useEffect(() => {
    // apply theme immediately
    try { saveSettings(settings); } catch (e) {}
  }, []);

  function update<K extends keyof AppSettings>(k: K, v: AppSettings[K]) {
    const next = { ...settings, [k]: v } as AppSettings;
    setSettings(next);
  }

  function onSave() {
    saveSettings(settings);
    setStatus("Paramètres enregistrés.");
    setTimeout(() => setStatus(null), 2000);
  }

  function onReset() {
    const def = resetSettings();
    setSettings(def);
    setStatus("Paramètres réinitialisés.");
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Paramètres</h1>
            <div className="text-sm text-muted-foreground">Gérez l'identité visuelle et le comportement de l'application</div>
          </div>

          <div className="bg-white rounded-md p-4 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Nom de l'application</label>
                <input value={settings.appName} onChange={(e) => update('appName', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Logo (URL)</label>
                <input value={settings.logoUrl} onChange={(e) => update('logoUrl', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Couleur primaire</label>
                <input value={settings.primaryColor} onChange={(e) => update('primaryColor', e.target.value)} type="color" className="w-16 h-10 rounded-md border px-1 py-1 mt-1" />
              </div>

              <div>
                <label className="text-sm">Intervalle rafraîchissement (ms)</label>
                <input value={String(settings.refreshIntervalMs)} onChange={(e) => update('refreshIntervalMs', Number(e.target.value || 0))} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">API Base URL</label>
                <input value={settings.apiBaseUrl} onChange={(e) => update('apiBaseUrl', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Fuseau horaire</label>
                <input value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Locale (date)</label>
                <input value={settings.dateLocale} onChange={(e) => update('dateLocale', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Snapshots périodiques</label>
                <div className="mt-1">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.enableSnapshots} onChange={(e) => update('enableSnapshots', e.target.checked)} /> Activer</label>
                </div>
              </div>

              <div>
                <label className="text-sm">Seuil recommandation (0-100%)</label>
                <input type="number" value={Math.round(settings.recommendationThreshold * 100)} onChange={(e) => update('recommendationThreshold', Math.max(0, Math.min(100, Number(e.target.value || 0))) / 100)} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">Nettoyage caractères indésirables</label>
                <div className="mt-1"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.removeGarbageChars} onChange={(e)=>update('removeGarbageChars', e.target.checked)} /> Activer</label></div>
              </div>

              <div>
                <label className="text-sm">PDF export - délai initial (s)</label>
                <input type="number" value={settings.pdfExportDelaySeconds} onChange={(e)=>update('pdfExportDelaySeconds', Number(e.target.value || 0))} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>

              <div>
                <label className="text-sm">PDF export - tentatives</label>
                <input type="number" value={settings.pdfExportRetries} onChange={(e)=>update('pdfExportRetries', Math.max(0, Number(e.target.value || 0)))} className="w-full rounded-md border px-3 py-2 mt-1" />
              </div>
            </div>

            <div className="bg-gray-50 rounded-md p-3 border">
              <h3 className="text-md font-semibold mb-2">Paramètres avancés</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.anonymizePII} onChange={(e) => update('anonymizePII', e.target.checked)} /> Anonymiser les PII</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.enableEmailNotifications} onChange={(e) => update('enableEmailNotifications', e.target.checked)} /> Activer notifications e-mail</label>

                <div>
                  <label className="text-sm">Fournisseur e-mail</label>
                  <select value={settings.emailProvider} onChange={(e) => update('emailProvider', e.target.value as any)} className="w-full rounded-md border px-3 py-2 mt-1">
                    <option value="test-local">Test local</option>
                    <option value="sendgrid">SendGrid</option>
                    <option value="smtp">SMTP</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">Adresse e‑mail d'envoi</label>
                  <input value={settings.emailFrom || ''} onChange={(e) => update('emailFrom', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Format de rapport par défaut</label>
                  <select value={settings.defaultReportFormat} onChange={(e) => update('defaultReportFormat', e.target.value as any)} className="w-full rounded-md border px-3 py-2 mt-1">
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">Rapports programmés</label>
                  <div className="mt-1"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.scheduledReportsEnabled} onChange={(e)=>update('scheduledReportsEnabled', e.target.checked)} /> Activer</label></div>
                </div>

                <div>
                  <label className="text-sm">Cron rapports programmés</label>
                  <input value={settings.scheduledReportsCron} onChange={(e)=>update('scheduledReportsCron', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Rétention (jours)</label>
                  <input type="number" value={String(settings.retentionDays)} onChange={(e)=>update('retentionDays', Number(e.target.value || 0))} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Taille max export (par batch)</label>
                  <input type="number" value={String(settings.maxExportBatch)} onChange={(e)=>update('maxExportBatch', Number(e.target.value || 0))} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Pré-capture export (ms)</label>
                  <input type="number" value={String(settings.exportPreCaptureMs)} onChange={(e)=>update('exportPreCaptureMs', Number(e.target.value || 0))} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Export canvas scale</label>
                  <input type="number" step="0.1" value={String(settings.exportCanvasScale)} onChange={(e)=>update('exportCanvasScale', Number(e.target.value || 1))} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div>
                  <label className="text-sm">Adresse(s) e-mail autorisées (domaine)</label>
                  <input value={settings.allowedEmailDomains || ''} onChange={(e)=>update('allowedEmailDomains', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" placeholder="ex: example.com,another.com" />
                </div>

                <div>
                  <label className="text-sm">Contact administrateur</label>
                  <input value={settings.adminContactEmail || ''} onChange={(e)=>update('adminContactEmail', e.target.value)} className="w-full rounded-md border px-3 py-2 mt-1" />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.autoExportOnSnapshot} onChange={(e)=>update('autoExportOnSnapshot', e.target.checked)} /> Export automatique lors des snapshots</label>
                </div>

                <div>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={settings.enableAnalytics} onChange={(e)=>update('enableAnalytics', e.target.checked)} /> Activer analytics</label>
                </div>

              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={onSave} className="px-3 py-2 rounded-md bg-primary text-white">Enregistrer</button>
              <button onClick={onReset} className="px-3 py-2 rounded-md border">Réinitialiser</button>
              {status && <div className="text-sm text-muted-foreground">{status}</div>}
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-semibold mb-2">Intégrations (MCP)</h3>
              <p className="text-sm text-muted-foreground mb-2">Pour stocker les paramètres et les snapshots côté serveur, connectez l'un des MCP recommandés :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Neon (Postgres serverless) — <a href="#" onClick={(e)=>{e.preventDefault(); window.alert('Cliquez sur Open MCP popover et Connect to Neon');}}>Connecter Neon</a></li>
                <li>Supabase — <a href="#" onClick={(e)=>{e.preventDefault(); window.alert('Cliquez sur Open MCP popover et Connect to Supabase');}}>Connecter Supabase</a></li>
                <li>Netlify (hébergement / fonctions) — <a href="#" onClick={(e)=>{e.preventDefault(); window.alert('Cliquez sur Open MCP popover et Connect to Netlify');}}>Connecter Netlify</a></li>
                <li>Zapier, Figma, Builder.io, Sentry, Semgrep, Linear, Notion, Prisma Postgres, Context7 — connectez-les via <strong>Open MCP popover</strong></li>
              </ul>
              <div className="mt-3 text-sm text-muted-foreground">Après connexion, je peux implémenter la persistance serveur et migrer ces paramètres vers la base.</div>

              <div className="mt-4 border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Gestion des utilisateurs</h3>
                <p className="text-sm text-muted-foreground mb-2">Créez des comptes d'accès et attribuez des rôles (admin/editor/viewer). Les utilisateurs sont stockés localement pour l'instant.</p>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => setShowUsers(true)} className="px-3 py-2 rounded-md bg-primary text-white">Ouvrir gestion utilisateurs</button>
                  <div className="text-sm text-muted-foreground">Les rôles contrôlent l'accès aux actions sensibles (ex: suppression, export massif).</div>
                </div>
                <ManageUsers open={showUsers} onOpenChange={(v)=>setShowUsers(v)} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
