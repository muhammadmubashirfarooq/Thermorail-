"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const heatTrend = [
  { time: "00:00", temp: 39, risk: 28 },
  { time: "04:00", temp: 36, risk: 25 },
  { time: "08:00", temp: 42, risk: 42 },
  { time: "12:00", temp: 49, risk: 60 },
  { time: "15:00", temp: 57, risk: 88 },
  { time: "18:00", temp: 53, risk: 76 },
  { time: "21:00", temp: 46, risk: 54 },
  { time: "23:00", temp: 41, risk: 38 },
];

const riskByRegion = [
  { name: "Houston", value: 34 },
  { name: "Permian", value: 27 },
  { name: "Phoenix", value: 18 },
  { name: "El Paso", value: 14 },
  { name: "Austin", value: 7 },
];

const riskByOperator = [
  { name: "Union Pacific", value: 58 },
  { name: "BNSF", value: 31 },
  { name: "Other", value: 11 },
];

const tempVsRisk = [
  { temp: 38, risk: 12 },
  { temp: 44, risk: 26 },
  { temp: 48, risk: 41 },
  { temp: 52, risk: 63 },
  { temp: 56, risk: 79 },
  { temp: 58, risk: 92 },
];

const speedVsRisk = [
  { speed: 25, risk: 42 },
  { speed: 35, risk: 52 },
  { speed: 45, risk: 61 },
  { speed: 55, risk: 73 },
  { speed: 65, risk: 84 },
  { speed: 75, risk: 92 },
];

const pieColors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#64748b"];

export default function Home() {
  return (
    <div className="page-stack analytics-page">
      <section className="section-header-row">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Operational risk intelligence</h2>
        </div>
        <button className="secondary-button">Export analysis</button>
      </section>

      <section className="metric-grid compact">
        <article className="metric-card">
          <div className="metric-header"><span>Average rail temp</span></div>
          <div className="metric-value">49.6°C</div>
          <div className="metric-description">Across monitored segments</div>
        </article>
        <article className="metric-card">
          <div className="metric-header"><span>High-risk segments</span></div>
          <div className="metric-value">118</div>
          <div className="metric-description">Requiring inspection</div>
        </article>
        <article className="metric-card">
          <div className="metric-header"><span>Critical alert count</span></div>
          <div className="metric-value">27</div>
          <div className="metric-description">Immediate operational response</div>
        </article>
        <article className="metric-card">
          <div className="metric-header"><span>Risk delta</span></div>
          <div className="metric-value">+3.4%</div>
          <div className="metric-description">Vs 7-day baseline</div>
        </article>
      </section>

      <section className="content-grid two-column chart-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Temperature trend</p>
              <h3>Rail temperature over time</h3>
            </div>
          </div>
          <div className="chart-wrap tall">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={heatTrend}>
                <defs>
                  <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#273249" strokeDasharray="4 4" />
                <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="°C" />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="temp" stroke="#f59e0b" fill="url(#tempFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Risk distribution</p>
              <h3>Risk share by region</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskByRegion} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={4}>
                  {riskByRegion.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="content-grid two-column chart-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operator view</p>
              <h3>Risk by operator</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskByOperator}>
                <CartesianGrid vertical={false} stroke="#273249" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#e11d48" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Thermal correlation</p>
              <h3>Temperature vs risk</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tempVsRisk}>
                <CartesianGrid vertical={false} stroke="#273249" strokeDasharray="4 4" />
                <XAxis dataKey="temp" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="°C" />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="risk" stroke="#60a5fa" fill="#1d4ed8" fillOpacity={0.2} strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="content-grid single-column">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operating conditions</p>
              <h3>Speed limit vs risk</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedVsRisk}>
                <CartesianGrid vertical={false} stroke="#273249" strokeDasharray="4 4" />
                <XAxis dataKey="speed" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="mph" />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="risk" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </div>
  );
}
