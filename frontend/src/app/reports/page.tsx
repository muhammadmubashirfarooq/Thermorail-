"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine
} from "recharts";
import {
  FileText,
  Download,
  Printer,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  AlertTriangle,
  Flame,
  Gauge
} from "lucide-react";

// Mock/Default representative operational rail segments dataset
const mockSegments = [
  { segment_id: "SW_permian_08", corridor_name: "Permian Basin West Sub", operator: "Union Pacific (UP)", region: "West Texas & Permian (TX)", speed_mph: 45, track_class: "Class 3 Freight", rail_temp_c: 58.4, risk_score: 94, status: "CRITICAL" },
  { segment_id: "SW_sunset_142", corridor_name: "Sunset Route MP 142.4", operator: "Union Pacific (UP)", region: "Houston Metro & Southeast TX", speed_mph: 60, track_class: "Class 4 Main", rail_temp_c: 57.2, risk_score: 91, status: "CRITICAL" },
  { segment_id: "SW_bnsf_galv_09", corridor_name: "BNSF Galveston Subdivision", operator: "BNSF Railway", region: "Houston Metro & Southeast TX", speed_mph: 55, track_class: "Class 4 Main", rail_temp_c: 56.5, risk_score: 88, status: "CRITICAL" },
  { segment_id: "SW_elpaso_31", corridor_name: "El Paso Terminal Lead", operator: "Union Pacific (UP)", region: "New Mexico & El Paso (NM/TX)", speed_mph: 35, track_class: "Class 2 Yard", rail_temp_c: 55.8, risk_score: 86, status: "CRITICAL" },
  { segment_id: "SW_tucson_04", corridor_name: "Tucson Gila Sub", operator: "Union Pacific (UP)", region: "Arizona (AZ)", speed_mph: 70, track_class: "Class 5 High", rail_temp_c: 54.1, risk_score: 82, status: "HIGH" },
  { segment_id: "SW_bnsf_dfw_22", corridor_name: "DFW Alliance Sub", operator: "BNSF Railway", region: "North Texas & DFW (TX)", speed_mph: 60, track_class: "Class 4 Main", rail_temp_c: 53.0, risk_score: 79, status: "HIGH" },
  { segment_id: "SW_beaumont_18", corridor_name: "Beaumont Chemical Lead", operator: "Union Pacific (UP)", region: "Houston Metro & Southeast TX", speed_mph: 40, track_class: "Class 3 Freight", rail_temp_c: 52.6, risk_score: 76, status: "HIGH" },
  { segment_id: "SW_phoenix_12", corridor_name: "Phoenix Industrial Lead", operator: "BNSF Railway", region: "Arizona (AZ)", speed_mph: 30, track_class: "Class 2 Yard", rail_temp_c: 51.9, risk_score: 74, status: "HIGH" }
];

const diurnalTrend = [
  { time: "00:00", temp: 38.2, threshold: 50.0 },
  { time: "04:00", temp: 36.5, threshold: 50.0 },
  { time: "08:00", temp: 42.8, threshold: 50.0 },
  { time: "12:00", temp: 51.4, threshold: 50.0 },
  { time: "15:00", temp: 58.4, threshold: 50.0 },
  { time: "18:00", temp: 53.2, threshold: 50.0 },
  { time: "21:00", temp: 46.1, threshold: 50.0 },
  { time: "23:59", temp: 41.5, threshold: 50.0 }
];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("today");
  const [region, setRegion] = useState("ALL");
  const [operator, setOperator] = useState("ALL");
  const [riskLevel, setRiskLevel] = useState("ALL");
  const [reportType, setReportType] = useState("network");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    return mockSegments.filter(s => {
      if (region !== "ALL" && !s.region.includes(region)) return false;
      if (operator !== "ALL" && !s.operator.includes(operator)) return false;
      if (riskLevel === "CRITICAL" && s.status !== "CRITICAL") return false;
      if (riskLevel === "HIGH" && s.status !== "HIGH" && s.status !== "CRITICAL") return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.segment_id.toLowerCase().includes(q) ||
          s.corridor_name.toLowerCase().includes(q) ||
          s.operator.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [region, operator, riskLevel, search]);

  const highRiskMiles = 9316;
  const criticalSegments = filtered.filter(s => s.status === "CRITICAL").length;
  const maxTemp = 58.4;

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* 1. Metadata Header & Control Toolbar */}
      <header className="border-b border-slate-800 pb-5 mb-6">
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mb-2">
          <span className="bg-slate-900 border border-slate-700 text-blue-400 px-2 py-0.5 rounded">Report #TR-2026-0829-0042</span>
          <span>|</span>
          <span>Generated: <strong>Aug 29, 2026 13:30 UTC</strong></span>
          <span>|</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Operational Decision Support
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Rail Thermal Stress &amp; Automated Inspection Report</h1>
        <p className="text-xs text-slate-400 mt-1">Continuous Welded Rail (CWR) buckling intelligence for railroad engineering &amp; dispatch personnel.</p>

        {/* Controls */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-md">
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="today">Today (24h Telemetry)</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="ALL">All Regions (Southwest)</option>
              <option value="TX">Texas (TX)</option>
              <option value="Houston">Houston Metro</option>
              <option value="NM">New Mexico (NM)</option>
              <option value="AZ">Arizona (AZ)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Operator</label>
            <select value={operator} onChange={e => setOperator(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="ALL">All Operators</option>
              <option value="Union Pacific">Union Pacific (UP)</option>
              <option value="BNSF">BNSF Railway</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Risk Level</label>
            <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="ALL">All Tiers</option>
              <option value="CRITICAL">Critical Risk (&ge;85)</option>
              <option value="HIGH">High Stress (65-84)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Report Type</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="network">Network Operations</option>
              <option value="route">Route Safety</option>
              <option value="segment">Segment Audit</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => window.print()} className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 py-1.5 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={() => alert("CSV exported")} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
      </header>

      {/* 2. Executive Narrative & KPI Row */}
      <section className="mb-6">
        <div className="bg-slate-900 border border-slate-800 border-l-4 border-l-blue-500 p-4 rounded-md mb-4">
          <div className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wider mb-1">Executive Operational Narrative</div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Analysis of <strong>45,955 track segments</strong> across <strong>26,700 monitored track miles</strong> indicates <strong>{highRiskMiles.toLocaleString()} track miles (34.9%)</strong> operating under elevated thermal stress (&ge;50.0°C or Risk Score &gt; 65). 
            A total of <strong>{criticalSegments} critical segments</strong> require prioritized field inspection or slow order evaluation, with peak rail temperatures reaching <strong>58.4°C</strong> along the <em>Permian Basin West Sub</em> corridor.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 border-l-4 border-l-amber-500 p-3.5 rounded-md">
            <div className="text-xs text-slate-400 font-medium">High-Risk Track</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{highRiskMiles.toLocaleString()} <span className="text-xs font-normal text-slate-400">mi</span></div>
            <div className="text-[11px] text-slate-500 mt-1">34.9% of monitored network</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 border-l-4 border-l-red-500 p-3.5 rounded-md">
            <div className="text-xs text-slate-400 font-medium">Critical Segments</div>
            <div className="text-2xl font-bold font-mono text-red-400 mt-1">{criticalSegments} <span className="text-xs font-normal text-slate-400">seg</span></div>
            <div className="text-[11px] text-slate-500 mt-1">Immediate slow order review</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-md">
            <div className="text-xs text-slate-400 font-medium">Max Peak Rail Temp</div>
            <div className="text-2xl font-bold font-mono text-red-400 mt-1">{maxTemp.toFixed(1)} <span className="text-xs font-normal text-slate-400">°C</span></div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">Permian Basin Sub</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-md">
            <div className="text-xs text-slate-400 font-medium">Risk Trend vs. Baseline</div>
            <div className="text-2xl font-bold font-mono text-blue-400 mt-1">+3.4% <span className="text-xs font-normal text-slate-400">delta</span></div>
            <div className="text-[11px] text-slate-500 mt-1">Compared to 7-day mean</div>
          </div>
        </div>
      </section>

      {/* 3. Critical Findings Matrix */}
      <section className="mb-6 bg-slate-900 border border-slate-800 p-4 rounded-md">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-white">Critical Findings Matrix (Top Priority Segments)</h2>
          <p className="text-[11px] text-slate-400">Ranked by ML buckle risk score requiring operational dispatch evaluation.</p>
        </div>
        <div className="space-y-2">
          {filtered.slice(0, 4).map((s, idx) => (
            <div key={s.segment_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-slate-800/60 border border-slate-700/60 rounded text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-slate-400 font-bold w-5">#{idx + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{s.segment_id}</span>
                    <span className="text-slate-300">{s.corridor_name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${s.status === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                      [{s.status}]
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {s.operator} &bull; {s.region} &bull; {s.speed_mph} mph limit
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase">Rail Temp</div>
                  <div className="font-mono font-bold text-red-400">{s.rail_temp_c}°C</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase">Risk Score</div>
                  <div className="font-mono font-bold text-amber-400">{s.risk_score}/100</div>
                </div>
                <button className="bg-slate-700 hover:bg-blue-600 text-slate-200 hover:text-white px-2.5 py-1.5 rounded text-xs font-medium transition">
                  View on Map &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Dual-Pane Analytics Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white">Thermal Risk Spatial Distribution</h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">VECTOR SNAPSHOT</span>
          </div>
          <div className="h-52 bg-slate-950 border border-slate-800 rounded flex items-center justify-center relative p-3">
            {/* SVG simulated rail network node distribution */}
            <svg className="w-full h-full" viewBox="0 0 400 200">
              <line x1="40" y1="100" x2="360" y2="100" stroke="#1e293b" strokeDasharray="4 4" />
              <line x1="200" y1="20" x2="200" y2="180" stroke="#1e293b" strokeDasharray="4 4" />
              <circle cx="80" cy="120" r="5" fill="#ef4444" opacity="0.9" />
              <circle cx="140" cy="90" r="4" fill="#f59e0b" opacity="0.9" />
              <circle cx="210" cy="140" r="6" fill="#ef4444" opacity="0.9" />
              <circle cx="280" cy="70" r="3.5" fill="#10b981" opacity="0.8" />
              <circle cx="330" cy="110" r="4" fill="#f59e0b" opacity="0.9" />
            </svg>
            <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Critical</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> High Stress</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Normal</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 italic">Map interpretation: Thermal risk concentrated along mainline corridors across Southwest Network.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white">Diurnal Rail Temperature &amp; Risk Trend</h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">24-HOUR PROFILE</span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={diurnalTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="time" stroke="#475569" fontSize={10} />
                <YAxis domain={[30, 65]} stroke="#475569" fontSize={10} unit="°C" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", fontSize: "11px" }} />
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "50°C CWR THRESHOLD", fill: "#ef4444", fontSize: 9 }} />
                <Line type="monotone" dataKey="temp" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} name="Rail Temp (°C)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500"></span> Diurnal Temperature Curve</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500 border-t border-dashed"></span> 50°C Critical Buckle Threshold</span>
          </div>
        </div>
      </section>

      {/* 5. Route & Segment Breakdown Table */}
      <section className="mb-6 bg-slate-900 border border-slate-800 p-4 rounded-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Route &amp; Segment Telemetry Breakdown</h3>
            <p className="text-[11px] text-slate-400">Operational track telemetry records for filtered subdivisions.</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search segment, corridor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-60"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-700">
              <tr>
                <th className="p-2.5">Segment ID</th>
                <th className="p-2.5">Operator</th>
                <th className="p-2.5">Rail Temp</th>
                <th className="p-2.5">Speed</th>
                <th className="p-2.5">Track Class</th>
                <th className="p-2.5">ML Risk</th>
                <th className="p-2.5">Priority Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filtered.map(s => (
                <tr key={s.segment_id} className="hover:bg-slate-800/40">
                  <td className="p-2.5 font-mono font-bold text-white">{s.segment_id}</td>
                  <td className="p-2.5">{s.operator}</td>
                  <td className={`p-2.5 font-mono font-bold ${s.rail_temp_c >= 50 ? 'text-red-400' : 'text-amber-400'}`}>{s.rail_temp_c.toFixed(1)}°C</td>
                  <td className="p-2.5 font-mono">{s.speed_mph} mph</td>
                  <td className="p-2.5 font-mono">{s.track_class}</td>
                  <td className={`p-2.5 font-mono font-bold ${s.risk_score >= 85 ? 'text-red-400' : 'text-amber-400'}`}>{s.risk_score}/100</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${s.status === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                      [{s.status}]
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Recommended Actions Engine */}
      <section className="mb-6 bg-slate-900 border border-slate-800 p-4 rounded-md">
        <div className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wider mb-2">Engineering &amp; Dispatch Directives</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded">
            <span className="bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">PRIORITY 1</span>
            <h4 className="text-xs font-bold text-white mt-1.5 mb-1">Mandatory Speed Advisory Review</h4>
            <p className="text-[11px] text-slate-400">Review operating speed exposure on {criticalSegments} critical segments exceeding the 50.0°C CWR buckling threshold.</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded">
            <span className="bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">PRIORITY 2</span>
            <h4 className="text-xs font-bold text-white mt-1.5 mb-1">Targeted Track Geometry Patrols</h4>
            <p className="text-[11px] text-slate-400">Prioritize visual and drone track geometry inspections for {highRiskMiles.toLocaleString()} track miles flagged with elevated stress.</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded">
            <span className="bg-blue-950 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">PRIORITY 3</span>
            <h4 className="text-xs font-bold text-white mt-1.5 mb-1">Thermal Remediation Deployment</h4>
            <p className="text-[11px] text-slate-400">Deploy water or coolant spray assets to designated high-risk terminal choke points during peak afternoon heating.</p>
          </div>
        </div>
      </section>

      {/* 7. Historical Comparison Matrix */}
      <section className="mb-6 bg-slate-900 border border-slate-800 p-4 rounded-md">
        <div className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wider mb-2">Historical Comparison Matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-700">
              <tr>
                <th className="p-2.5">Operational Metric</th>
                <th className="p-2.5">Previous Baseline Period</th>
                <th className="p-2.5">Current Operating Period</th>
                <th className="p-2.5">Net Delta / % Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              <tr>
                <td className="p-2.5 font-semibold text-white">High-Risk Track Miles</td>
                <td className="p-2.5 font-mono">8,804 mi</td>
                <td className="p-2.5 font-mono font-bold text-amber-400">9,316 mi</td>
                <td className="p-2.5 font-mono font-bold text-red-400">+512 mi (+3.4%)</td>
              </tr>
              <tr>
                <td className="p-2.5 font-semibold text-white">Critical Segments (&ge;85 Risk)</td>
                <td className="p-2.5 font-mono">1,510 seg</td>
                <td className="p-2.5 font-mono font-bold text-red-400">1,641 seg</td>
                <td className="p-2.5 font-mono font-bold text-red-400">+131 seg</td>
              </tr>
              <tr>
                <td className="p-2.5 font-semibold text-white">Peak Rail Temperature</td>
                <td className="p-2.5 font-mono">56.3°C</td>
                <td className="p-2.5 font-mono font-bold text-red-400">58.4°C</td>
                <td className="p-2.5 font-mono font-bold text-red-400">+2.1°C</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 8. Methodology & Limitations Drawer */}
      <section className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-white bg-slate-800/80 hover:bg-slate-800 transition"
        >
          <span>Methodology, Telemetry Pipelines &amp; Institutional Disclaimers</span>
          {drawerOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {drawerOpen && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 border-t border-slate-800">
            <div>
              <h5 className="font-bold text-white mb-1">Thermal Balance Modeling</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">Rail temperature estimates integrate ambient temperature, direct solar radiation flux, track azimuth orientation, and environmental albedo modifiers within a 500m spatial buffer.</p>
            </div>
            <div>
              <h5 className="font-bold text-white mb-1">FRA Track Class Standards</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">Safety standards correlate operating speeds with lateral rail stress thresholds to establish baseline tolerances for continuous welded rail (CWR).</p>
            </div>
            <div>
              <h5 className="font-bold text-red-400 mb-1">Official Safety Disclaimer</h5>
              <p className="text-[11px] text-red-400/90 leading-relaxed">ThermoRail provides decision-support risk intelligence and does not establish legal causality or supersede authoritative railroad dispatch directives.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
