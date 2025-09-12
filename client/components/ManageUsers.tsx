import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { loadUsers, addUser, updateUser, removeUser, User, Role } from "@/lib/users";

export default function ManageUsers({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [users, setUsers] = React.useState<User[]>(() => loadUsers());
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("viewer");

  React.useEffect(() => {
    setUsers(loadUsers());
  }, [open]);

  const onAdd = () => {
    if (!name.trim()) return alert("Nom requis");
    const u = addUser({ name: name.trim(), email: email.trim() || undefined, role });
    setUsers(loadUsers());
    setName("");
    setEmail("");
    setRole("viewer");
  };

  const onToggleRole = (u: User, r: Role) => {
    updateUser(u.id, { role: r });
    setUsers(loadUsers());
  };

  const onRemove = (u: User) => {
    if (!confirm(`Supprimer ${u.name} ?`)) return;
    removeUser(u.id);
    setUsers(loadUsers());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Gestion des utilisateurs</DialogTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className="rounded-md border px-3 py-2" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optionnel)" className="rounded-md border px-3 py-2" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border px-3 py-2">
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onAdd} className="px-3 py-2 rounded-md bg-primary text-white">Ajouter</button>
            <button onClick={() => { setName(""); setEmail(""); setRole("viewer"); }} className="px-3 py-2 rounded-md border">Annuler</button>
          </div>

          <div className="border rounded-md p-3 bg-white">
            <div className="text-sm text-muted-foreground mb-2">Utilisateurs existants</div>
            <div className="space-y-2">
              {users.length === 0 && <div className="text-sm text-muted-foreground">Aucun utilisateur</div>}
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={u.role} onChange={(e) => onToggleRole(u, e.target.value as Role)} className="rounded-md border px-2 py-1 text-sm">
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button onClick={() => onRemove(u)} className="px-2 py-1 rounded-md border bg-destructive text-white text-xs">Suppr</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
