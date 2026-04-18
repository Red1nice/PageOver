import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { 
  Upload, 
  Github, 
  Search, 
  PieChart as PieIcon, 
  Layers, 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  BarChart3,
  ShieldCheck,
  History,
  FileCode,
  Globe,
  Plus
} from "lucide-react";
import axios from "axios";
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title 
} from "chart.js";
import { Pie, Bar } from "react-chartjs-2";
import { db } from "./lib/firebase";
import { collection, addDoc, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface AnalysisResult {
  projectName: string;
  source: string;
  languages: Record<string, number>;
  frameworks: string[];
  originalityScore: number;
  fileCount: number;
  isLive?: boolean;
}

export default function App() {
  const [tab, setTab] = useState<"zip" | "github">("zip");
  const [loading, setLoading] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [compareWith, setCompareWith] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [view, setView] = useState<"analyze" | "history" | "compare">("analyze");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "sessions"), orderBy("timestamp", "desc"), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as AnalysisResult);
      setHistory(docs);
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("/api/analyze/zip", formData);
      setResult(res.data);
      saveToFirebase(res.data);
    } catch (err) {
      alert("Failed to analyze ZIP file");
    } finally {
      setLoading(false);
    }
  };

  const handleGithubSubmit = async () => {
    if (!githubUrl) return;
    setLoading(true);
    try {
      const res = await axios.post("/api/analyze/github", { url: githubUrl });
      setResult(res.data);
      saveToFirebase(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to analyze GitHub repository";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const saveToFirebase = async (data: AnalysisResult) => {
    try {
      await addDoc(collection(db, "sessions"), {
        ...data,
        timestamp: Timestamp.now()
      });
    } catch (err) {
      console.error("Firebase save error:", err);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#0D0E12", // Match theme bg
        scale: 2,
        logging: false,
        useCORS: true
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`PageOver_Report_${result?.projectName || "analysis"}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("Failed to generate PDF");
    } finally {
      setLoading(false);
    }
  };

  const chartData = result ? {
    labels: Object.keys(result.languages),
    datasets: [{
      label: "Language Distribution %",
      data: Object.values(result.languages),
      backgroundColor: [
        "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#6366F1", "#EC4899", "#8B5CF6"
      ],
      borderWidth: 0,
    }]
  } : null;

  const getComparisonData = () => {
    if (!result || !compareWith) return null;
    return {
      labels: ["Score", "Files", "Languages", "Frameworks"],
      datasets: [
        {
          label: result.projectName,
          data: [result.originalityScore, result.fileCount, Object.keys(result.languages).length, result.frameworks.length],
          backgroundColor: "rgba(59, 130, 246, 0.6)",
        },
        {
          label: compareWith.projectName,
          data: [compareWith.originalityScore, compareWith.fileCount, Object.keys(compareWith.languages).length, compareWith.frameworks.length],
          backgroundColor: "rgba(239, 68, 68, 0.6)",
        }
      ]
    };
  };

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans selection:bg-accent/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="h-[60px] border-b border-border bg-panel/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center cursor-pointer group" onClick={() => setView("analyze")}>
            <svg width="120" height="40" viewBox="0 0 300 100" className="h-10 w-auto">
              {/* PAGE part */}
              <g fill="var(--color-accent)">
                <path d="M10 20h30v60H10z M50 20h30l10 30-10 30H50L60 50z M100 20h30v60h-30z M140 20h30v10h-20v15h20v10h-20v15h20v10h-30z" 
                      style={{ filter: "drop-shadow(0 0 8px var(--color-accent))" }}
                      className="opacity-90"
                />
                <text x="5" y="55" fontFamily="Inter" fontWeight="900" fontSize="70" letterSpacing="-4">PAGE</text>
              </g>
              {/* OVER part */}
              <rect x="0" y="65" width="290" height="35" rx="2" fill="var(--color-danger)" />
              <text x="145" y="92" textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="900" fontSize="28" fill="white" letterSpacing="12">OVER</text>
            </svg>
          </div>
          <div className="flex gap-4">
            <NavBtn active={view === "analyze"} onClick={() => setView("analyze")}>Analysis</NavBtn>
            <NavBtn active={view === "history"} onClick={() => setView("history")}>History</NavBtn>
            {result && <button onClick={() => setView("analyze")} className="bg-accent hover:bg-accent/80 text-white text-xs font-bold px-4 py-2 rounded uppercase tracking-wider transition-all">New Scan</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {view === "analyze" && (
            <motion.div 
              key="analyze"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {!result ? (
                <div className="max-w-xl mx-auto space-y-8 mt-12">
                  <div className="text-center space-y-2">
                    <h1 className="text-4xl font-black uppercase tracking-tighter italic">PageOver</h1>
                    <p className="text-text-dim text-[10px] font-mono uppercase tracking-[0.3em]">Intelligent Project Evaluation & Visualization Platform</p>
                  </div>
                  
                  <div className="bg-panel border border-border rounded-lg p-6 shadow-2xl">
                    <div className="flex bg-bg p-1 rounded-md mb-6 border border-border">
                      <button 
                        onClick={() => setTab("zip")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${tab === "zip" ? "bg-accent text-white" : "text-text-dim hover:text-text-main"}`}
                      >
                        <Upload className="w-3 h-3" /> ZIP ARCHIVE
                      </button>
                      <button 
                        onClick={() => setTab("github")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${tab === "github" ? "bg-accent text-white" : "text-text-dim hover:text-text-main"}`}
                      >
                        <Github className="w-3 h-3" /> GITHUB REPO
                      </button>
                    </div>

                    {tab === "zip" ? (
                      <div className="relative group">
                        <input 
                          type="file" 
                          accept=".zip" 
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        />
                        <div className="border border-dashed border-border rounded-lg p-10 text-center group-hover:border-accent/50 transition-colors bg-bg/50">
                          <Upload className="text-accent w-8 h-8 mx-auto mb-4 opacity-50" />
                          <h3 className="text-sm font-bold uppercase tracking-wider">Drag archive here</h3>
                          <p className="text-[10px] text-text-dim font-mono mt-2">SYSTEM.EXTRACT == ZIP</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative">
                          <Github className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim w-4 h-4" />
                          <input 
                            type="text" 
                            placeholder="GITHUB_REPOSITORY_URL"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            className="w-full bg-bg border border-border rounded-md py-3 pl-10 pr-3 focus:outline-none focus:border-accent transition-colors text-text-main font-mono text-sm"
                          />
                        </div>
                        <button 
                          onClick={handleGithubSubmit}
                          disabled={loading || !githubUrl}
                          className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-bold py-3 rounded text-xs uppercase tracking-widest transition-all"
                        >
                          {loading ? "SCANNING..." : "EXECUTE ANALYSIS"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6" ref={reportRef}>
                  {/* Result Header */}
                  <div className="border-b border-border pb-6 flex items-end justify-between">
                    <div>
                      <div className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-1">Target Identified: {result.source.toUpperCase()}</div>
                      <h1 className="text-3xl font-black uppercase tracking-tight">{result.projectName}</h1>
                      <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${result.isLive ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {result.isLive ? "Live / Deployed" : "Internal / Build"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setView("compare")} className="px-4 py-2 bg-panel border border-border text-xs font-bold rounded uppercase hover:bg-white/5 transition-all">Compare</button>
                      <button onClick={() => setResult(null)} className="px-4 py-2 bg-panel border border-border text-xs font-bold rounded uppercase hover:bg-white/5 transition-all">Reset</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-6">
                      {/* Metric Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <CompactMetric label="Originality" score={`${result.originalityScore}%`} status="secure" />
                        <CompactMetric label="Files Index" score={result.fileCount} />
                        <CompactMetric label="Stack Count" score={result.frameworks.length} />
                        <CompactMetric label="Analysis ID" score={Date.now().toString().slice(-4)} />
                      </div>

                      {/* Language Distribution */}
                      <div className="bg-panel border border-border rounded-lg p-6">
                        <SectionLabel label="Language Metrics" extra={`${result.fileCount} Files Indexed`} />
                        <div className="h-6 w-full flex bg-border rounded overflow-hidden mt-4">
                          {Object.entries(result.languages).map(([lang, pct], i) => (
                            <div 
                              key={lang} 
                              className="h-full transition-all duration-1000"
                              style={{ 
                                width: `${pct}%`, 
                                backgroundColor: i === 0 ? "#3178C6" : i === 1 ? "#F1E05A" : i === 2 ? "#E34C26" : "#4A5568" 
                              }}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                          {Object.entries(result.languages).map(([lang, pct], i) => (
                            <div key={lang} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? "#3178C6" : i === 1 ? "#F1E05A" : i === 2 ? "#E34C26" : "#4A5568" }} />
                              <span className="text-[11px] font-mono text-text-dim uppercase">{lang} ({pct}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Frameworks */}
                      <div className="bg-panel border border-border rounded-lg p-6">
                        <SectionLabel label="Detected Environment Stack" />
                        <div className="flex flex-wrap gap-2 mt-4">
                          {result.frameworks.length > 0 ? result.frameworks.map(fw => (
                            <span key={fw} className="px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded text-[11px] font-black uppercase tracking-widest">{fw}</span>
                          )) : (
                            <span className="text-text-dim text-[11px] font-mono uppercase">Unknown Stack Identity</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-4">
                      <div className="bg-panel border border-border rounded-lg p-6 sticky top-24">
                        <SectionLabel label="Integrity Overview" />
                        <div className="mt-8 text-center">
                          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-border border-t-accent">
                            <span className="text-4xl font-black">{result.originalityScore}</span>
                          </div>
                          <p className="mt-4 text-[10px] text-text-dim font-mono uppercase tracking-widest">Confidence Index High</p>
                        </div>
                        <div className="mt-8 space-y-3">
                          <button 
                            onClick={exportToPDF}
                            disabled={loading}
                            className="w-full py-3 bg-accent text-white text-[10px] font-black uppercase tracking-widest rounded transition-all hover:bg-accent/90 disabled:opacity-50"
                          >
                            {loading ? "GENERATING..." : "Export Report PDF"}
                          </button>
                          <button onClick={() => setView("compare")} className="w-full py-3 bg-bg border border-border text-text-dim text-[10px] font-black uppercase tracking-widest rounded transition-all hover:text-text-main">Compare vs Stored</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === "history" && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="border-b border-border pb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Access History</h2>
                  <p className="text-[10px] text-text-dim font-mono mt-1">RECENTS_LOCAL_SNAPSHOT_010</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((h, i) => (
                  <div key={i} className="bg-panel border border-border rounded-lg p-5 group hover:border-accent/40 transition-all cursor-pointer" onClick={() => { setResult(h); setView("analyze"); }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-8 h-8 rounded bg-bg flex items-center justify-center text-text-dim group-hover:text-accent transition-colors">
                        {h.source === "github" ? <Github size={16} /> : <Upload size={16} />}
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-black text-text-dim uppercase tracking-widest opacity-50">Score</div>
                        <div className="text-xl font-black">{h.originalityScore}</div>
                      </div>
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-tight truncate border-b border-border/10 pb-2">{h.projectName}</h4>
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {Object.keys(h.languages).slice(0, 3).map(l => (
                        <span key={l} className="text-[9px] font-mono px-1.5 py-0.5 bg-bg rounded text-text-dim uppercase">{l}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === "compare" && (
            <motion.div 
              key="compare"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Project Delta Analysis</h2>
                  <p className="text-[10px] text-text-dim font-mono mt-1">REALTIME_METRIC_DIVERGENCE</p>
                </div>
                <button onClick={() => setView("analyze")} className="text-xs font-bold text-text-dim hover:text-accent uppercase tracking-widest">Close [ESC]</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
                <div className="bg-panel p-6">
                  <ComparisonSelectionHD label="A: BASE_REF" current={result} history={history} onSelect={setResult} />
                </div>
                <div className="bg-panel p-6">
                  <ComparisonSelectionHD label="B: TARGET_REF" current={compareWith} history={history} onSelect={setCompareWith} />
                </div>
              </div>

              {result && compareWith && (
                <div className="space-y-6">
                  <div className="bg-panel border border-border rounded-lg p-8">
                    <div className="h-[300px]">
                      <Bar 
                        data={getComparisonData()!} 
                        options={{ 
                          responsive: true, 
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            y: { grid: { color: '#2A2E37' }, border: { display: false }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#94A3B8' } },
                            x: { grid: { display: false }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#94A3B8' } }
                          }
                        }} 
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-8 p-6 bg-panel border border-border rounded-lg">
                    <HDDeltaStat label="Delta Score" v1={result.originalityScore} v2={compareWith.originalityScore} suffix="%" />
                    <HDDeltaStat label="Delta Files" v1={result.fileCount} v2={compareWith.fileCount} />
                    <HDDeltaStat label="Env Range" v1={result.frameworks.length} v2={compareWith.frameworks.length} />
                    <div className="ml-auto flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[9px] font-black text-text-dim uppercase tracking-widest">Confidence Index</div>
                        <div className="text-[10px] text-text-dim font-mono">DIVERGENCE_VERIFIED</div>
                      </div>
                      <div className="w-12 h-12 rounded-full border-4 border-border border-t-accent flex items-center justify-center text-[11px] font-black">98%</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavBtn({ children, active, onClick }: { children: React.ReactNode, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`text-[11px] font-black uppercase tracking-widest px-4 py-2 border rounded transition-all ${active ? "bg-accent border-accent text-white" : "bg-bg border-border text-text-dim hover:text-text-main"}`}
    >
      {children}
    </button>
  );
}

function CompactMetric({ label, score, status }: { label: string, score: string | number, status?: string }) {
  return (
    <div className="bg-panel border border-border p-4 rounded-md">
      <div className="text-[10px] font-mono text-text-dim uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-black font-mono">{score}</div>
    </div>
  );
}

function SectionLabel({ label, extra }: { label: string, extra?: string }) {
  return (
    <div className="flex justify-between items-end border-b border-dotted border-border pb-2 mb-4">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-dim">{label}</span>
      {extra && <span className="text-[10px] font-mono text-text-dim">{extra}</span>}
    </div>
  );
}

function ComparisonSelectionHD({ label, current, history, onSelect }: any) {
  return (
    <div className="space-y-4">
      <label className="text-[10px] font-black text-text-dim uppercase tracking-widest block">{label}</label>
      <div className="bg-bg border border-border rounded overflow-hidden">
        <div className="p-3 bg-panel border-b border-border">
          <p className="text-xs font-bold uppercase truncate">{current ? current.projectName : "Select Reference..."}</p>
        </div>
        <div className="max-h-40 overflow-y-auto font-mono">
          {history.map((h: any, idx: number) => (
            <button 
              key={idx}
              onClick={() => onSelect(h)}
              className="w-full text-left p-3 hover:bg-white/5 text-[11px] transition-colors flex items-center justify-between border-b border-border/5"
            >
              <span className="truncate">{h.projectName}</span>
              <span className="text-accent opacity-50 shrink-0 font-black">[{h.originalityScore}]</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HDDeltaStat({ label, v1, v2, suffix = "" }: any) {
  const diff = v1 - v2;
  const isPositive = diff > 0;
  return (
    <div>
      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${diff === 0 ? "text-text-main" : isPositive ? "text-success" : "text-danger"}`}>
        {isPositive ? "+" : ""}{diff}{suffix}
      </div>
    </div>
  );
}

