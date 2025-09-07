import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";

const SHEET_ID = "1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os";

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function cellToString(c: any) {
  if (!c) return "";
  if (typeof c === "string") return c;
  if (typeof c === "number") return String(c);
  if (c.v != null) return String(c.v);
  return "";
}

export default function Repondants() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["repondants"],
    queryFn: async () => {
      // Try to fetch via internal API if available
      try {
        const apiUrl = new URL('/api/resort/vm-resort-albanie/respondents', window.location.origin).toString();
        const r = await fetch(apiUrl, { credentials: 'same-origin' });
        if (r.ok) return (await r.json());
      } catch (e) {
        // ignore and fallback to direct gviz
      }

      const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
      const r = await fetch(gurl);
      if (!r.ok) throw new Error('Unable to fetch sheet');
      const text = await r.text();
      const parsed = parseGviz(text);
      const cols: string[] = (parsed.table.cols || []).map((c: any) => (c.label || '').toString().toLowerCase());
      const rows: any[] = parsed.table.rows || [];

      // Determine likely column indices
      const idxName = cols.findIndex((c) => c.includes('nom') || c.includes('name'));
      const idxEmail = cols.findIndex((c) => c.includes('mail') || c.includes('email'));
      const idxNote = cols.findIndex((c) => c.includes('note') || c.includes('rating'));
      const idxDate = cols.findIndex((c) => c.includes('date'));

      const items = rows
        .map((rrow: any) => {
          const c = rrow.c || [];
          return {
            name: cellToString(c[idxName]) || cellToString(c[0]) || '',
            email: cellToString(c[idxEmail]) || '',
            note: cellToString(c[idxNote]) || '',
            date: cellToString(c[idxDate]) || '',
          };
        })
        .filter((it) => it.name || it.email || it.note || it.date);

      return items;
    },
    refetchOnWindowFocus: false,
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
              <CardTitle>Liste des Répondants ({isLoading ? '…' : data?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && <div>Chargement…</div>}
              {isError && <div className="text-red-600">Impossible de charger les répondants.</div>}

              {data && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 table-auto">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Nom</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Note</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {data.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-800">{row.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.note}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.date}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <button className="inline-flex items-center gap-2 rounded-full border p-2 hover:bg-gray-100">
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </main>
      </div>
    </div>
  );
}
