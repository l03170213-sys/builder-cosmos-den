export type Role = "admin" | "editor" | "viewer";

export type User = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  createdAt: string;
};

const STORAGE_KEY = "vm_users_v1";

export function loadUsers(): User[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as User[];
  } catch (e) {
    return [];
  }
}

export function saveUsers(users: User[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    // noop
  }
}

export function addUser(u: { name: string; email?: string; role?: Role }) {
  const users = loadUsers();
  const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const user: User = {
    id,
    name: u.name,
    email: u.email,
    role: u.role || "viewer",
    createdAt: new Date().toISOString(),
  };
  const next = [user, ...users];
  saveUsers(next);
  return user;
}

export function updateUser(id: string, patch: Partial<User>) {
  const users = loadUsers();
  const next = users.map((u) => (u.id === id ? { ...u, ...patch } : u));
  saveUsers(next);
  return next;
}

export function removeUser(id: string) {
  const users = loadUsers();
  const next = users.filter((u) => u.id !== id);
  saveUsers(next);
  return next;
}
