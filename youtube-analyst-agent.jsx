import { useState, useRef, useEffect } from "react";

const AGENTS = [
  {
    id: "strategist",
    name: "Strategy Agent",
    role: "Channel Growth Strategist",
    icon: "📈",
    color: "#FF4500",
    prompt: (input) => `You are a YouTube Channel Growth Strategist. Analyze the following YouTube channel/video/topic and provide a comprehensive GROWTH STRATEGY analysis:

"${input}"

Respond in Indonesian. Structure your response with these sections:
**🎯 Analisis Potensi Channel**
**📊 Target Audience & Niche**
**🚀 Strategi Pertumbuhan (3-6 bulan)**
**💡 Content Pillars (3-5 topik utama)**
**⚡ Quick Wins (yang bisa dilakukan minggu ini)**

Be specific, data-driven, and actionable. Use bullet points and emojis for readability.`,
  },
  {
    id: "seo",
    name: "SEO Agent",
    role: "YouTube SEO Specialist",
    icon: "🔍",
    color: "#00B4D8",
    prompt: (input) => `You are a YouTube SEO Specialist. Analyze and optimize the following for maximum YouTube search visibility:

"${input}"

Respond in Indonesian. Provide:
**🔑 Keyword Research**
- Primary keywords (high volume)
- Secondary/LSI keywords
- Long-tail opportunities

**📝 Title Optimization**
- 3 optimized title options (with CTR-bait elements)

**🏷️ Tag Strategy**
- 15-20 recommended tags

**📄 Description Template**
- SEO-optimized description structure

**🖼️ Thumbnail Tips**
- What elements to include for high CTR

Use real examples and be very specific.`,
  },
  {
    id: "content",
    name: "Content Agent",
    role: "Content & Script Analyst",
    icon: "✍️",
    color: "#7B2FBE",
    prompt: (input) => `You are a YouTube Content and Script Analyst. Create a detailed content plan for:

"${input}"

Respond in Indonesian. Include:
**🎬 Video Concept & Hook (0-30 detik)**
**📋 Script Outline**
- Intro hook
- Main points (3-5 segmen)
- Call to action

**📅 Content Calendar (4 minggu)**
- Jadwal posting yang optimal
- Variasi format konten

**🔥 Trending Angle**
- Bagaimana membuat topik ini viral/trending
- Hooks yang biasa digunakan kreator top

**📊 Video Structure Best Practices**
- Durasi ideal
- Pacing & retention tips`,
  },
  {
    id: "monetization",
    name: "Monetize Agent",
    role: "Monetization Strategist",
    icon: "💰",
    color: "#00C851",
    prompt: (input) => `You are a YouTube Monetization Expert. Analyze monetization potential for:

"${input}"

Respond in Indonesian. Cover:
**💵 Revenue Streams Analysis**
- AdSense RPM estimation untuk niche ini
- Sponsorship potential
- Merchandise/digital products
- Membership/community

**🤝 Brand Deal Strategy**
- Jenis brand yang cocok
- Rate card recommendation
- Cara pitch ke brand

**📈 Revenue Projections**
- Estimasi pendapatan per 1K, 10K, 100K views
- Timeline monetisasi

**🛒 Affiliate Marketing**
- Program afiliasi terbaik untuk niche ini
- Cara integrasi natural ke konten

**⚠️ Monetization Pitfalls**
- Hal yang harus dihindari`,
  },
  {
    id: "competitor",
    name: "Competitor Agent",
    role: "Competitive Intelligence Analyst",
    icon: "🕵️",
    color: "#FF6B35",
    prompt: (input) => `You are a YouTube Competitive Intelligence Analyst. Perform competitor analysis for:

"${input}"

Respond in Indonesian. Analyze:
**🏆 Landscape Kompetitif**
- Tipe kreator yang dominan di niche ini
- Gap & peluang yang belum diisi

**📊 Benchmark Metrics**
- Views, subscribers, engagement rate rata-rata
- Upload frequency ideal

**💪 Differentiation Strategy**
- 5 cara untuk tampil beda dari kompetitor
- Unique value proposition yang bisa dikembangkan

**🔄 Content Gaps**
- Topik yang belum banyak dibahas
- Format yang kurang dieksplor

**📌 Lessons from Top Creators**
- Pola sukses yang bisa ditiru (bukan dijiplak)`,
  },
];

const ORCHESTRATOR_PROMPT = (input, agentResults) => `You are the Chief YouTube Strategy Orchestrator. You have received analysis from 5 specialized AI agents for this topic/channel: "${input}"

Here are their reports:
${agentResults}

Now synthesize everything into a MASTER STRATEGY BRIEF in Indonesian. Format:

**🎯 EXECUTIVE SUMMARY**
(2-3 kalimat ringkasan peluang utama)

**⭐ TOP 5 PRIORITY ACTIONS**
(Urutan berdasarkan impact vs effort)

**🗓️ 90-DAY ROADMAP**
- Bulan 1: Foundation
- Bulan 2: Growth
- Bulan 3: Scale

**⚠️ CRITICAL WARNINGS**
(Hal penting yang harus dihindari)

**🏁 SUCCESS METRICS**
(KPI yang harus ditrack)

Be decisive, specific, and inspiring. This is the final word.`;

export default function YouTubeAnalystAgent() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [activeAgent, setActiveAgent] = useState(null);
  const [results, setResults] = useState({});
  const [orchestratorResult, setOrchestratorResult] = useState("");
  const [completedAgents, setCompletedAgents] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamText, orchestratorResult]);

  const callClaude = async (prompt) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    return data.content?.[0]?.text || "Tidak ada respons.";
  };

  const runAnalysis = async () => {
    if (!input.trim()) return;
    setPhase("running");
    setResults({});
    setCompletedAgents([]);
    setOrchestratorResult("");
    setSelectedResult(null);

    const allResults = {};

    for (const agent of AGENTS) {
      setActiveAgent(agent.id);
      setStreamText("");
      try {
        const result = await callClaude(agent.prompt(input));
        allResults[agent.id] = result;
        setResults((prev) => ({ ...prev, [agent.id]: result }));
        setCompletedAgents((prev) => [...prev, agent.id]);
      } catch (e) {
        allResults[agent.id] = "Error: Gagal mendapatkan respons.";
        setResults((prev) => ({ ...prev, [agent.id]: "Error." }));
        setCompletedAgents((prev) => [...prev, agent.id]);
      }
    }

    // Run orchestrator
    setActiveAgent("orchestrator");
    const agentSummaries = AGENTS.map(
      (a) => `=== ${a.name} (${a.role}) ===\n${allResults[a.id]}`
    ).join("\n\n");

    try {
      const masterResult = await callClaude(
        ORCHESTRATOR_PROMPT(input, agentSummaries)
      );
      setOrchestratorResult(masterResult);
    } catch (e) {
      setOrchestratorResult("Error saat orchestration.");
    }

    setActiveAgent(null);
    setPhase("done");
  };

  const reset = () => {
    setPhase("idle");
    setInput("");
    setResults({});
    setCompletedAgents([]);
    setOrchestratorResult("");
    setSelectedResult(null);
    setActiveAgent(null);
  };

  const formatText = (text) => {
    return text
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <div key={i} className="section-header">
              {line.replace(/\*\*/g, "")}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="bullet-item">
              {line}
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="spacer" />;
        return (
          <div key={i} className="text-line">
            {line.replace(/\*\*/g, "")}
          </div>
        );
      });
  };

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .app {
          min-height: 100vh;
          background: #0a0a0f;
          color: #e8e8f0;
          font-family: 'DM Sans', sans-serif;
          overflow-x: hidden;
        }

        .noise-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        }

        .grid-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: linear-gradient(rgba(255,69,0,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,69,0,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .glow-orb {
          position: fixed; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,69,0,0.08) 0%, transparent 70%);
          top: -200px; right: -200px; pointer-events: none; z-index: 0;
        }

        .container {
          position: relative; z-index: 1;
          max-width: 1100px; margin: 0 auto; padding: 0 24px 80px;
        }

        /* HEADER */
        .header {
          padding: 48px 0 32px;
          display: flex; align-items: flex-end; justify-content: space-between;
        }

        .logo-area { display: flex; align-items: center; gap: 16px; }
        .logo-icon {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg, #FF4500, #FF6B35);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; box-shadow: 0 0 30px rgba(255,69,0,0.4);
        }

        .logo-text { display: flex; flex-direction: column; }
        .logo-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 28px;
          letter-spacing: 2px; color: #fff; line-height: 1;
        }
        .logo-sub { font-size: 11px; color: #666; letter-spacing: 3px; text-transform: uppercase; margin-top: 2px; }

        .version-badge {
          background: rgba(255,69,0,0.1); border: 1px solid rgba(255,69,0,0.3);
          color: #FF6B35; font-size: 11px; padding: 4px 10px; border-radius: 20px;
          letter-spacing: 1px;
        }

        /* INPUT SECTION */
        .input-section {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; padding: 28px; margin-bottom: 32px;
          backdrop-filter: blur(10px);
        }

        .input-label {
          font-size: 12px; color: #888; letter-spacing: 2px; text-transform: uppercase;
          margin-bottom: 12px;
        }

        .input-row { display: flex; gap: 12px; }

        .main-input {
          flex: 1; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 14px 18px; color: #fff; font-family: 'DM Sans', sans-serif;
          font-size: 15px; outline: none; transition: border-color 0.2s;
        }
        .main-input:focus { border-color: rgba(255,69,0,0.5); }
        .main-input::placeholder { color: #444; }

        .run-btn {
          background: linear-gradient(135deg, #FF4500, #FF6B35);
          border: none; border-radius: 12px; padding: 14px 28px;
          color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: all 0.2s; letter-spacing: 0.5px;
          box-shadow: 0 4px 20px rgba(255,69,0,0.3);
        }
        .run-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(255,69,0,0.45); }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .reset-btn {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 14px 20px; color: #888;
          font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer;
          transition: all 0.2s;
        }
        .reset-btn:hover { background: rgba(255,255,255,0.08); color: #ccc; }

        .hint-text {
          font-size: 12px; color: #555; margin-top: 10px;
        }

        /* AGENT PIPELINE */
        .pipeline-label {
          font-size: 11px; color: #666; letter-spacing: 3px; text-transform: uppercase;
          margin-bottom: 16px;
        }

        .agents-row {
          display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 32px;
        }

        .agent-chip {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 10px 14px; transition: all 0.3s; cursor: pointer;
        }
        .agent-chip:hover { background: rgba(255,255,255,0.06); }
        .agent-chip.active {
          border-color: currentColor; background: rgba(255,255,255,0.06);
          box-shadow: 0 0 16px currentColor;
          animation: pulse 1.5s ease-in-out infinite;
        }
        .agent-chip.completed { border-color: rgba(0,200,81,0.4); }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .agent-icon { font-size: 16px; }
        .agent-name { font-size: 12px; font-weight: 500; }
        .agent-status { font-size: 10px; opacity: 0.6; }

        .status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #333; margin-left: 4px;
        }
        .status-dot.active { background: #ffaa00; box-shadow: 0 0 6px #ffaa00; }
        .status-dot.done { background: #00C851; }

        /* RESULTS GRID */
        .results-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px; margin-bottom: 28px;
        }

        .result-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.2s;
          position: relative; overflow: hidden;
        }
        .result-card:hover { background: rgba(255,255,255,0.05); transform: translateY(-2px); }
        .result-card.selected { border-color: currentColor; }

        .card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .card-icon { font-size: 20px; }
        .card-info { flex: 1; }
        .card-title { font-size: 13px; font-weight: 600; }
        .card-role { font-size: 11px; color: #666; margin-top: 2px; }

        .card-preview {
          font-size: 12px; color: #888; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 3;
          -webkit-box-orient: vertical; overflow: hidden;
        }

        .card-footer { display: flex; justify-content: flex-end; margin-top: 10px; }
        .view-btn {
          font-size: 11px; color: #FF6B35; cursor: pointer;
          letter-spacing: 1px; text-transform: uppercase;
        }

        /* DETAIL PANEL */
        .detail-panel {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; padding: 28px; margin-bottom: 28px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .detail-header {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
          padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .detail-icon { font-size: 28px; }
        .detail-title { font-size: 18px; font-weight: 600; }
        .detail-role { font-size: 12px; color: #888; margin-top: 2px; }
        .close-btn {
          margin-left: auto; background: rgba(255,255,255,0.05); border: none;
          color: #666; width: 32px; height: 32px; border-radius: 8px;
          cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .close-btn:hover { background: rgba(255,255,255,0.1); color: #ccc; }

        .detail-content { font-size: 14px; line-height: 1.7; }
        .section-header {
          color: #FF6B35; font-weight: 600; font-size: 14px;
          margin: 16px 0 8px; letter-spacing: 0.3px;
        }
        .bullet-item { padding: 3px 0 3px 12px; color: #c8c8d8; }
        .text-line { color: #b0b0c0; }
        .spacer { height: 6px; }

        /* ORCHESTRATOR */
        .orchestrator-section {
          background: linear-gradient(135deg, rgba(255,69,0,0.05), rgba(123,47,190,0.05));
          border: 1px solid rgba(255,69,0,0.2); border-radius: 20px; padding: 28px;
          animation: fadeIn 0.4s ease;
        }

        .orch-header {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
        }
        .orch-badge {
          background: linear-gradient(135deg, #FF4500, #7B2FBE);
          padding: 6px 14px; border-radius: 20px; font-size: 11px;
          font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
          box-shadow: 0 0 20px rgba(255,69,0,0.3);
        }
        .orch-title { font-size: 18px; font-weight: 600; }

        .orch-content { font-size: 14px; line-height: 1.7; }

        /* LOADING STATE */
        .loading-bar {
          height: 2px; background: rgba(255,255,255,0.05);
          border-radius: 2px; overflow: hidden; margin-top: 20px;
        }
        .loading-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #FF4500, #FF6B35, #FF4500);
          background-size: 200% 100%;
          animation: shimmer 1.5s linear infinite;
          border-radius: 2px;
          transition: width 0.5s ease;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .thinking-dots::after {
          content: '';
          animation: dots 1.5s steps(4, end) infinite;
        }
        @keyframes dots {
          0%, 20% { content: ''; }
          40% { content: '.'; }
          60% { content: '..'; }
          80%, 100% { content: '...'; }
        }

        .copy-btn {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: #888; font-size: 11px; padding: 6px 12px; border-radius: 8px;
          cursor: pointer; letter-spacing: 1px; margin-left: auto;
          transition: all 0.2s;
        }
        .copy-btn:hover { background: rgba(255,255,255,0.1); color: #ccc; }
      `}</style>

      <div className="noise-bg" />
      <div className="grid-overlay" />
      <div className="glow-orb" />

      <div className="container">
        {/* HEADER */}
        <div className="header">
          <div className="logo-area">
            <div className="logo-icon">▶</div>
            <div className="logo-text">
              <div className="logo-title">YouTube AI Analyst</div>
              <div className="logo-sub">Multi-Agent Intelligence System</div>
            </div>
          </div>
          <div className="version-badge">v2.0 · 5 AGENTS</div>
        </div>

        {/* INPUT */}
        <div className="input-section">
          <div className="input-label">Analisis Channel / Video / Niche</div>
          <div className="input-row">
            <input
              className="main-input"
              placeholder="Contoh: channel memasak Indonesia, tips investasi saham pemula, review gadget..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && phase === "idle" && runAnalysis()}
              disabled={phase === "running"}
            />
            {phase === "done" ? (
              <button className="reset-btn" onClick={reset}>Reset</button>
            ) : (
              <button
                className="run-btn"
                onClick={runAnalysis}
                disabled={phase === "running" || !input.trim()}
              >
                {phase === "running" ? "Analyzing..." : "🚀 Analisis"}
              </button>
            )}
          </div>
          {phase === "idle" && (
            <div className="hint-text">
              💡 Masukkan nama channel, topik video, atau niche yang ingin dianalisis
            </div>
          )}
          {phase === "running" && (
            <div className="loading-bar">
              <div
                className="loading-bar-fill"
                style={{ width: `${(completedAgents.length / (AGENTS.length + 1)) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* AGENT PIPELINE */}
        {phase !== "idle" && (
          <>
            <div className="pipeline-label">Pipeline Status</div>
            <div className="agents-row">
              {AGENTS.map((agent) => {
                const isActive = activeAgent === agent.id;
                const isDone = completedAgents.includes(agent.id);
                return (
                  <div
                    key={agent.id}
                    className={`agent-chip ${isActive ? "active" : ""} ${isDone ? "completed" : ""}`}
                    style={{ color: agent.color, borderColor: isActive ? agent.color : isDone ? "#00C851" : undefined }}
                    onClick={() => isDone && setSelectedResult(agent.id === selectedResult ? null : agent.id)}
                  >
                    <span className="agent-icon">{agent.icon}</span>
                    <div>
                      <div className="agent-name" style={{ color: isActive || isDone ? "#e8e8f0" : "#666" }}>
                        {agent.name}
                      </div>
                      <div className="agent-status">
                        {isActive ? <span className="thinking-dots">Thinking</span> : isDone ? "✓ Done" : "Waiting"}
                      </div>
                    </div>
                    <div className={`status-dot ${isActive ? "active" : isDone ? "done" : ""}`} />
                  </div>
                );
              })}
              <div
                className={`agent-chip ${activeAgent === "orchestrator" ? "active" : ""} ${phase === "done" ? "completed" : ""}`}
                style={{ color: "#a855f7", borderColor: activeAgent === "orchestrator" ? "#a855f7" : phase === "done" ? "#00C851" : undefined }}
                onClick={() => phase === "done" && setSelectedResult(selectedResult === "orchestrator" ? null : "orchestrator")}
              >
                <span className="agent-icon">🧠</span>
                <div>
                  <div className="agent-name" style={{ color: activeAgent === "orchestrator" || phase === "done" ? "#e8e8f0" : "#666" }}>
                    Orchestrator
                  </div>
                  <div className="agent-status">
                    {activeAgent === "orchestrator" ? <span className="thinking-dots">Synthesizing</span> : phase === "done" ? "✓ Done" : "Waiting"}
                  </div>
                </div>
                <div className={`status-dot ${activeAgent === "orchestrator" ? "active" : phase === "done" ? "done" : ""}`} />
              </div>
            </div>
          </>
        )}

        {/* RESULTS CARDS */}
        {completedAgents.length > 0 && (
          <div className="results-grid">
            {AGENTS.filter((a) => completedAgents.includes(a.id)).map((agent) => (
              <div
                key={agent.id}
                className={`result-card ${selectedResult === agent.id ? "selected" : ""}`}
                style={{ borderColor: selectedResult === agent.id ? agent.color : undefined, "--card-color": agent.color }}
                onClick={() => setSelectedResult(selectedResult === agent.id ? null : agent.id)}
              >
                <div className="card-top">
                  <div className="card-icon">{agent.icon}</div>
                  <div className="card-info">
                    <div className="card-title" style={{ color: agent.color }}>{agent.name}</div>
                    <div className="card-role">{agent.role}</div>
                  </div>
                </div>
                <div className="card-preview">{results[agent.id] || ""}</div>
                <div className="card-footer">
                  <span className="view-btn">{selectedResult === agent.id ? "▲ Tutup" : "▼ Lihat detail"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DETAIL PANEL */}
        {selectedResult && selectedResult !== "orchestrator" && results[selectedResult] && (
          <div className="detail-panel">
            {(() => {
              const agent = AGENTS.find((a) => a.id === selectedResult);
              return (
                <>
                  <div className="detail-header">
                    <span className="detail-icon">{agent.icon}</span>
                    <div>
                      <div className="detail-title" style={{ color: agent.color }}>{agent.name}</div>
                      <div className="detail-role">{agent.role}</div>
                    </div>
                    <button
                      className="copy-btn"
                      onClick={() => navigator.clipboard.writeText(results[selectedResult])}
                    >COPY</button>
                    <button className="close-btn" onClick={() => setSelectedResult(null)}>✕</button>
                  </div>
                  <div className="detail-content">{formatText(results[selectedResult])}</div>
                </>
              );
            })()}
          </div>
        )}

        {/* ORCHESTRATOR RESULT */}
        {(phase === "done" || activeAgent === "orchestrator") && orchestratorResult && (
          <div className="orchestrator-section">
            <div className="orch-header">
              <span style={{ fontSize: 28 }}>🧠</span>
              <div>
                <div className="orch-title">Master Strategy Brief</div>
              </div>
              <div className="orch-badge">Orchestrator</div>
              <button
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(orchestratorResult)}
              >COPY</button>
            </div>
            <div className="orch-content">{formatText(orchestratorResult)}</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
