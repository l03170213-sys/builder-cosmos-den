import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { CategoryAverage } from "@shared/api";

export function StatCard({ title, value, subtitle, icon }: { title: string; value: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

export function CategoryBars({ data }: { data: CategoryAverage[] }) {
  const chartData = data.map((d) => ({ name: d.name, Note: d.average }));
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Notes par Catégorie</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} height={60} textAnchor="end" />
              <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} />
              <Tooltip />
              <Bar dataKey="Note" fill="#8884d8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function CategoryDistribution({ data }: { data: CategoryAverage[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Répartition des Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((item) => (
          <div key={item.name} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <div className="text-sm text-muted-foreground">{item.name}</div>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                <div
                  className={cn("h-2 rounded-full bg-primary")}
                  style={{ width: `${(item.average / 5) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-sm font-medium tabular-nums">{item.average.toFixed(1)}/5</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
