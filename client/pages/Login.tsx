import * as React from "react";

type Props = {
  onSuccess: () => void;
};

export default function Login({ onSuccess }: Props) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const submittingRef = React.useRef(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    // Strict match as requested (uppercase)
    if (password === "TOPOFTRAVEL") {
      try {
        localStorage.setItem("vm:authed", "1");
      } catch (e) {
        // ignore localStorage errors
      }
      onSuccess();
    } else {
      setError("Mot de passe incorrect");
    }

    submittingRef.current = false;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-6">
        <h1 className="text-lg font-semibold mb-4">Accès protégé</h1>
        <p className="text-sm text-muted-foreground mb-4">Entrez le mot de passe pour accéder à l'application.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Mot de passe"
              aria-label="mot de passe"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-white text-sm"
            >
              Se connecter
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() => {
                // show a gentle hint (non-sensitive)
                alert('Indice: le mot de passe est en MAJUSCULES.');
              }}
            >
              Besoin d'aide ?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
