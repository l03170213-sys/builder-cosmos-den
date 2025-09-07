import React from "react";
import { ResponsiveContainer, BarChart, Bar, LabelList, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import type { CategoryAverage } from "@shared/api";

export default function ChartOnly({ data, chartType = "bar", id = "chart-wrapper", showValues = false }: { data: CategoryAverage[]; chartType?: "bar" | "line" | "pie" | "radar"; id?: string; showValues?: boolean }) {
  const chartData = data.map((d) => ({ name: d.name, Note: d.average }));
  const colors = ["#7c3aed", "#06b6d4", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#f97316"];

  return (
    <div id={id} style={{ width: '100%', height: 420 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "bar" ? (
          <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} height={60} textAnchor="end" />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
            <Tooltip />
            <Bar dataKey="Note" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
              {showValues && <LabelList dataKey="Note" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}`} />}
            </Bar>
          </BarChart>
        ) : chartType === "line" ? (
          <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} height={60} textAnchor="end" />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
            <Tooltip />
            <Line type="monotone" dataKey="Note" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }}>
              {showValues && <LabelList dataKey="Note" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}`} />}
            </Line>
          </LineChart>
        ) : chartType === "pie" ? (
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={chartData} dataKey="Note" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
              {chartData.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius={100}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis angle={30} domain={[0, 5]} />
            <Radar name="Note" dataKey="Note" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
            <Tooltip />
          </RadarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
