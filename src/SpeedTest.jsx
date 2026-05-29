/**
 * NetPulse — Beautiful Speed Test UI
 * Beautiful redesign using Syne + DM Mono fonts, animated waveform,
 * accent bars, badge ratings, and history table.
 *
 * Requires backend running on http://localhost:3001 (see server.js)
 *
 * Add to index.html head:
 *   <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet">
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "https://speed-test-api.onrender.com";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const fmtSpeed = (v) => {
  if (v === null || v === undefined) return "—";
  if (v >= 1000) return (v / 1000).toFixed(2);
  if (v >= 1) return v.toFixed(1);
  return (v * 1000).toFixed(0);
};

const fmtUnit = (v) => {
  if (v === null || v === undefined) return "Mbps";
  if (v >= 1000) return "Gbps";
  if (v >= 1) return "Mbps";
  return "Kbps";
};

const fmtMs = (v) =>
  v === null || v === undefined ? "—" : `${Math.round(v)} ms`;

const speedRating = (v) => {
  if (!v) return null;
  if (v >= 100) return { label: "Excellent", color: "#085041", bg: "#E1F5EE" };
  if (v >= 25)  return { label: "Good",      color: "#085041", bg: "#E1F5EE" };
  if (v >= 5)   return { label: "Fair",      color: "#633806", bg: "#FAEEDA" };
  return                { label: "Poor",      color: "#791F1F", bg: "#FCEBEB" };
};

const pingRating = (v) => {
  if (!v) return null;
  if (v < 20)  return { label: "Excellent", color: "#085041", bg: "#E1F5EE" };
  if (v < 60)  return { label: "Good",      color: "#085041", bg: "#E1F5EE" };
  if (v < 120) return { label: "Fair",      color: "#633806", bg: "#FAEEDA" };
  return               { label: "Poor",      color: "#791F1F", bg: "#FCEBEB" };
};

/* ─── WaveCanvas ────────────────────────────────────────────────────────── */
const WaveCanvas = ({ active, color }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!active) return;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const amplitude = 10 + 7 * Math.sin(x / 80 + tRef.current * 0.7);
        const y = h / 2 + amplitude * Math.sin(x / 30 + tRef.current * 2)
                        + 5 * Math.sin(x / 60 + tRef.current * 3.1);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      tRef.current += 0.04;
      rafRef.current = requestAnimationFrame(draw);
    };

    if (active) {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      draw();
    } else {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [active, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "56px", marginTop: "10px", opacity: 0.75 }}
    />
  );
};

/* ─── Badge ─────────────────────────────────────────────────────────────── */
const Badge = ({ label, color, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    fontSize: "10px", fontWeight: 600, padding: "2px 8px",
    borderRadius: "99px", letterSpacing: "0.04em",
    color, background: bg,
  }}>{label}</span>
);

/* ─── MetricCard ─────────────────────────────────────────────────────────── */
const MetricCard = ({ icon, label, value, unit, rating, accentColor, accentPct }) => (
  <div style={{
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "16px", padding: "1.1rem 1.1rem 0.9rem",
    display: "flex", flexDirection: "column", gap: "6px",
    position: "relative", overflow: "hidden", flex: 1, minWidth: "130px",
  }}>
    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ color: accentColor, fontSize: "14px" }}>{icon}</span>
      {label}
    </div>
    <div style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "-1px", fontFamily: "'DM Mono', monospace", color: "var(--color-text-primary)", lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "'DM Mono', monospace" }}>{unit}</span>
      {rating && <Badge {...rating} />}
    </div>
    {/* Accent bottom bar */}
    <div style={{
      position: "absolute", bottom: 0, left: 0, height: "3px",
      width: "100%", background: "var(--color-background-secondary)",
    }}>
      <div style={{
        height: "100%", background: accentColor,
        width: `${(accentPct || 0) * 100}%`,
        transition: "width 0.4s ease",
        borderRadius: "0 2px 2px 0",
      }} />
    </div>
  </div>
);

/* ─── HistoryRow ─────────────────────────────────────────────────────────── */
const HistoryRow = ({ item }) => (
  <div style={{
    display: "grid", gridTemplateColumns: "90px 1fr 1fr 80px 80px",
    gap: "8px", padding: "9px 0",
    borderBottom: "0.5px solid var(--color-border-tertiary)",
    fontSize: "12px", alignItems: "center",
    fontFamily: "'DM Mono', monospace",
  }}>
    <span style={{ color: "var(--color-text-secondary)" }}>
      {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
    <span style={{ color: "#1D9E75" }}>{fmtSpeed(item.download)} <span style={{ fontSize: "10px", opacity: 0.7 }}>{fmtUnit(item.download)}</span></span>
    <span style={{ color: "#378ADD" }}>{fmtSpeed(item.upload)} <span style={{ fontSize: "10px", opacity: 0.7 }}>{fmtUnit(item.upload)}</span></span>
    <span>{fmtMs(item.ping)}</span>
    <span style={{ color: "var(--color-text-secondary)" }}>{fmtMs(item.jitter)}</span>
  </div>
);

/* ─── Main App ──────────────────────────────────────────────────────────── */
export default function SpeedTest() {
  const [phase, setPhase] = useState("idle"); // idle | ping | download | upload | done
  const [dl, setDl] = useState(null);
  const [ul, setUl] = useState(null);
  const [ping, setPing] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [livePct, setLivePct] = useState(0);
  const [liveLabel, setLiveLabel] = useState("");
  const [liveSpeedStr, setLiveSpeedStr] = useState("");
  const [liveColor, setLiveColor] = useState("#1D9E75");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [dlPct, setDlPct] = useState(0);
  const [ulPct, setUlPct] = useState(0);
  const [pingPct, setPingPct] = useState(0);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const startTimer = () => {
    setElapsed(0);
    clearInterval(timerRef.current);
    let s = 0;
    timerRef.current = setInterval(() => { s++; setElapsed(s); }, 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); setElapsed(0); };

  const runPing = useCallback(async () => {
    setPhase("ping");
    setLiveLabel("Testing latency…");
    setLiveColor("#BA7517");
    const pings = [];
    for (let i = 0; i < 10; i++) {
      try {
        const t0 = performance.now();
        await fetch(`${API_BASE}/api/ping?t=${Date.now()}`, { signal: abortRef.current?.signal });
        pings.push(performance.now() - t0);
        const avg = pings.reduce((a, b) => a + b) / pings.length;
        setPing(avg);
        setPingPct(Math.min(avg / 200, 1));
        setLivePct((i + 1) * 10);
        setLiveSpeedStr(`Probing… ${i + 1}/10`);
      } catch (e) {
        if (e.name === "AbortError") return null;
      }
    }
    const avg = pings.reduce((a, b) => a + b) / pings.length;
    const j = pings.slice(1).reduce((a, v, i) => a + Math.abs(v - pings[i]), 0) / (pings.length - 1);
    setPing(avg); setJitter(j);
    setPingPct(Math.min(avg / 200, 1));
    return { ping: avg, jitter: j };
  }, []);

  const runDownload = useCallback(async () => {
    setPhase("download");
    setLiveColor("#1D9E75");
    const CHUNK = 5 * 1024 * 1024;
    const DURATION = 8000;
    const start = performance.now();
    let totalBytes = 0;
    let done = false;
    setTimeout(() => { done = true; }, DURATION);
    while (!done) {
      try {
        const t0 = performance.now();
        const res = await fetch(`${API_BASE}/api/download?size=${CHUNK}&t=${Date.now()}`, { signal: abortRef.current?.signal });
        const buf = await res.arrayBuffer();
        const mbps = (buf.byteLength * 8) / ((performance.now() - t0) / 1000 * 1e6);
        totalBytes += buf.byteLength;
        setDl(mbps);
        setDlPct(Math.min(mbps / 500, 1));
        setLivePct(Math.min(((performance.now() - start) / DURATION) * 100, 99));
        setLiveLabel("Measuring download");
        setLiveSpeedStr(`↓ ${fmtSpeed(mbps)} ${fmtUnit(mbps)}`);
      } catch (e) {
        if (e.name === "AbortError") return null;
        break;
      }
    }
    const final = (totalBytes * 8) / ((performance.now() - start) / 1000 * 1e6);
    setDl(final); setDlPct(Math.min(final / 500, 1));
    return final;
  }, []);

  const runUpload = useCallback(async () => {
    setPhase("upload");
    setLiveColor("#378ADD");
    const CHUNK = 2 * 1024 * 1024;
    const DURATION = 8000;
    const start = performance.now();
    let totalBytes = 0;
    let done = false;
    setTimeout(() => { done = true; }, DURATION);
    while (!done) {
      try {
        const data = new Uint8Array(CHUNK).fill(0x41);
        const t0 = performance.now();
        await fetch(`${API_BASE}/api/upload`, {
          method: "POST", body: data,
          headers: { "Content-Type": "application/octet-stream" },
          signal: abortRef.current?.signal,
        });
        const mbps = (CHUNK * 8) / ((performance.now() - t0) / 1000 * 1e6);
        totalBytes += CHUNK;
        setUl(mbps); setUlPct(Math.min(mbps / 500, 1));
        setLivePct(Math.min(((performance.now() - start) / DURATION) * 100, 99));
        setLiveLabel("Measuring upload");
        setLiveSpeedStr(`↑ ${fmtSpeed(mbps)} ${fmtUnit(mbps)}`);
      } catch (e) {
        if (e.name === "AbortError") return null;
        break;
      }
    }
    const final = (totalBytes * 8) / ((performance.now() - start) / 1000 * 1e6);
    setUl(final); setUlPct(Math.min(final / 500, 1));
    return final;
  }, []);

  const startTest = useCallback(async () => {
    setError(null);
    setDl(null); setUl(null); setPing(null); setJitter(null);
    setDlPct(0); setUlPct(0); setPingPct(0);
    setLivePct(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startTimer();
    try {
      const pd = await runPing();
      if (!pd) { stopTimer(); setPhase("idle"); return; }
      const d = await runDownload();
      if (d === null) { stopTimer(); setPhase("idle"); return; }
      const u = await runUpload();
      if (u === null) { stopTimer(); setPhase("idle"); return; }
      stopTimer();
      setPhase("done");
      setHistory((h) => [{ timestamp: Date.now(), download: d, upload: u, ping: pd.ping, jitter: pd.jitter }, ...h].slice(0, 8));
    } catch (e) {
      setError("Test failed. Is the backend running on port 3001?");
      setPhase("idle");
      stopTimer();
    }
  }, [runPing, runDownload, runUpload]);

  const stopTest = () => { abortRef.current?.abort(); setPhase("idle"); stopTimer(); };

  const isRunning = phase !== "idle" && phase !== "done";
  const waveActive = phase === "download" || phase === "upload";

  const STATUS = {
    idle: { label: "Ready", dotColor: "#888780", bg: "#F1EFE8", color: "#444441" },
    ping: { label: "Testing latency…", dotColor: "#BA7517", bg: "#FAEEDA", color: "#633806" },
    download: { label: "Downloading…", dotColor: "#378ADD", bg: "#E6F1FB", color: "#0C447C" },
    upload: { label: "Uploading…", dotColor: "#378ADD", bg: "#E6F1FB", color: "#0C447C" },
    done: { label: "Complete", dotColor: "#1D9E75", bg: "#E1F5EE", color: "#085041" },
  };
  const status = STATUS[phase] || STATUS.idle;

  return (
    <div style={{ fontFamily: "'Syne', sans-serif", padding: "1.5rem 0" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#1D9E75" }}>◈</span> NetPulse
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "3px" }}>
            Real-time internet speed diagnostic
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "11px", fontWeight: 500, padding: "4px 12px", borderRadius: "99px",
          letterSpacing: "0.04em", background: status.bg, color: status.color,
        }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: status.dotColor, display: "inline-block", flexShrink: 0 }} />
          {status.label}
        </span>
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <MetricCard icon="↓" label="Download" value={fmtSpeed(dl)} unit={fmtUnit(dl)} rating={speedRating(dl)} accentColor="#1D9E75" accentPct={dlPct} />
        <MetricCard icon="↑" label="Upload"   value={fmtSpeed(ul)} unit={fmtUnit(ul)} rating={speedRating(ul)} accentColor="#378ADD" accentPct={ulPct} />
        <MetricCard icon="◎" label="Ping"     value={fmtSpeed(ping)} unit="ms"        rating={pingRating(ping)} accentColor="#BA7517" accentPct={pingPct} />
        <MetricCard icon="~" label="Jitter"   value={fmtSpeed(jitter)} unit="ms"      rating={null}            accentColor="#D4537E" accentPct={jitter ? Math.min(jitter / 100, 1) : 0} />
      </div>

      {/* Live progress panel */}
      {isRunning && (
        <div style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "16px", padding: "1rem 1.25rem", marginBottom: "1.25rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{liveLabel}</span>
            <span style={{ fontSize: "17px", fontWeight: 500, fontFamily: "'DM Mono', monospace", color: "var(--color-text-primary)" }}>{liveSpeedStr}</span>
          </div>
          <div style={{ height: "5px", background: "var(--color-background-secondary)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${livePct}%`, background: liveColor, borderRadius: "3px", transition: "width 0.25s ease" }} />
          </div>
          <WaveCanvas active={waveActive} color={liveColor} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: "#FCEBEB", border: "0.5px solid #F09595",
          borderRadius: "12px", padding: "12px 16px", marginBottom: "1.25rem",
          fontSize: "13px", color: "#791F1F",
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "1.75rem" }}>
        {!isRunning ? (
          <button onClick={startTest} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "11px 30px", fontFamily: "'Syne', sans-serif",
            fontSize: "15px", fontWeight: 600, borderRadius: "99px",
            cursor: "pointer", border: "none",
            background: phase === "done" ? "var(--color-background-primary)" : "#0F6E56",
            color: phase === "done" ? "var(--color-text-primary)" : "#fff",
            ...(phase === "done" ? { border: "0.5px solid var(--color-border-secondary)" } : {}),
          }}>
            ▶ {phase === "done" ? "Run again" : "Start test"}
          </button>
        ) : (
          <button onClick={stopTest} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "11px 30px", fontFamily: "'Syne', sans-serif",
            fontSize: "15px", fontWeight: 600, borderRadius: "99px",
            cursor: "pointer", border: "none", background: "#A32D2D", color: "#fff",
          }}>
            ■ Stop
          </button>
        )}
        {isRunning && (
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "'DM Mono', monospace" }}>
            {elapsed}s elapsed
          </span>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "16px", padding: "1rem 1.25rem",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "7px" }}>
            ⟳ History
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 80px 80px", gap: "8px", paddingBottom: "8px", borderBottom: "0.5px solid var(--color-border-secondary)", marginBottom: "4px" }}>
            {["Time", "Download", "Upload", "Ping", "Jitter"].map((h) => (
              <span key={h} style={{ fontSize: "11px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {history.map((item) => <HistoryRow key={item.timestamp} item={item} />)}
        </div>
      )}
    </div>
  );
}
