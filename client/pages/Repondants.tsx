import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Repondants() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["resort-summary"],
    queryFn: async () => {
      const url = new URL('/api/resort/vm-resort-albanie/summary', window.location.origin).toString();
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Network error');
      return (await r.json()) as { resort: string; respondents: number; recommendationRate: number | null };
    },
  });

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Header />
        <main className="max-w-screen-2xl mx-auto w-full px-4 py-6">
          <h2 className="text-2xl font-semibold mb-4">Répondants</h2>

          <Card>
            <CardHeader>
              <CardTitle>Résumé des répondants</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && <div>Chargement…</div>}
              {isError && <div className="text-red-600">Impossible de charger les répondants.</div>}
              {data && (
                <div>
                  <div className="text-lg font-semibold">Nombre total de répondants: {data.respondents}</div>
                  <div className="mt-2 text-sm text-muted-foreground">Taux de recommandation: {data.recommendationRate != null ? `${Math.round(data.recommendationRate*100)}%` : 'Non disponible'}</div>
                </div>
              )}
            </CardContent>
          </Card>

        </main>
      </div>
    </div>
  );
}
