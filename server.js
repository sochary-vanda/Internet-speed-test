/**
 * Speed Test Backend — Node.js / Express
 *
 * Endpoints:
 *   GET  /api/ping           — Latency probe (returns 200 immediately)
 *   GET  /api/download       — Streams random bytes for download measurement
 *   POST /api/upload         — Receives bytes, measures throughput
 *   GET  /api/results        — Returns stored test results (in-memory)
 *   POST /api/results        — Saves a completed test result
 *
 * Usage:
 *   npm install express cors
 *   node server.js
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: "*", // In production, restrict to your frontend domain
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Requested-With"],
}));

// Parse raw binary body for upload endpoint (up to 50MB)
app.use("/api/upload", express.raw({ type: "application/octet-stream", limit: "50mb" }));

// Parse JSON for results endpoint
app.use("/api/results", express.json());

// Disable caching on all API routes so each request is fresh
app.use("/api", (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  next();
});

// ─── In-memory results store ──────────────────────────────────────────────────

const results = [];
const MAX_RESULTS = 100;

// ─── Route: Ping ─────────────────────────────────────────────────────────────
// The client measures round-trip time by recording timestamps around this call.
// We include server-side timestamps so the client can also compute one-way delay.

app.get("/api/ping", (req, res) => {
  res.json({
    serverTime: Date.now(),
    message: "pong",
  });
});

// ─── Route: Download ─────────────────────────────────────────────────────────
// Streams `size` bytes of random data back to the client.
// The client measures how long it takes to receive the full response.
//
// Query params:
//   size  — bytes to send (default 5MB, max 50MB)
//   t     — cache-busting timestamp (ignored)

app.get("/api/download", (req, res) => {
  const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
  const DEFAULT_BYTES = 5 * 1024 * 1024; // 5 MB
  const CHUNK = 256 * 1024; // 256 KB write chunks

  const requestedSize = parseInt(req.query.size, 10);
  const size = isNaN(requestedSize)
    ? DEFAULT_BYTES
    : Math.min(Math.max(requestedSize, 1024), MAX_BYTES);

  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Length": size,
    "X-Speed-Test-Bytes": size,
  });

  let sent = 0;

  const writeChunk = () => {
    if (sent >= size) {
      res.end();
      return;
    }

    const toWrite = Math.min(CHUNK, size - sent);
    const chunk = crypto.randomBytes(toWrite);
    const ok = res.write(chunk);
    sent += toWrite;

    if (!ok) {
      // Respect backpressure — wait for drain before writing more
      res.once("drain", writeChunk);
    } else {
      // Use setImmediate to avoid blocking the event loop
      setImmediate(writeChunk);
    }
  };

  writeChunk();

  req.on("close", () => {
    // Client disconnected mid-stream — nothing to do, res.write handles it
  });
});

// ─── Route: Upload ───────────────────────────────────────────────────────────
// Receives a binary payload and reports how many bytes arrived.
// The client measures the round-trip time and computes upload speed.
//
// For a more accurate server-side measurement, we track the time from
// first byte to last byte using a streaming approach.

app.post("/api/upload", (req, res) => {
  // express.raw() has already buffered the body for us.
  // For very large payloads, streaming is better (see streaming variant below).
  const bytes = req.body ? req.body.byteLength : 0;

  res.json({
    received: bytes,
    serverTime: Date.now(),
    message: "ok",
  });
});

// ─── Route: Upload (streaming variant) ───────────────────────────────────────
// If you want server-side throughput calculation, replace the route above
// with this streaming version that reads the raw request stream directly.
//
// app.post("/api/upload-stream", (req, res) => {
//   let bytes = 0;
//   const start = process.hrtime.bigint();
//
//   req.on("data", (chunk) => {
//     bytes += chunk.length;
//   });
//
//   req.on("end", () => {
//     const nsElapsed = Number(process.hrtime.bigint() - start);
//     const seconds = nsElapsed / 1e9;
//     const mbps = (bytes * 8) / (seconds * 1e6);
//     res.json({ received: bytes, durationMs: Math.round(seconds * 1000), serverMbps: +mbps.toFixed(2) });
//   });
//
//   req.on("error", (err) => {
//     console.error("Upload stream error:", err.message);
//     if (!res.headersSent) res.status(500).json({ error: "Stream error" });
//   });
// });

// ─── Route: Save result ───────────────────────────────────────────────────────
// POST /api/results  { download, upload, ping, jitter, timestamp }

app.post("/api/results", (req, res) => {
  const { download, upload, ping, jitter } = req.body;

  if (
    typeof download !== "number" ||
    typeof upload !== "number" ||
    typeof ping !== "number"
  ) {
    return res.status(400).json({ error: "download, upload, and ping are required numbers" });
  }

  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    download: +download.toFixed(2),
    upload: +upload.toFixed(2),
    ping: +ping.toFixed(2),
    jitter: jitter != null ? +jitter.toFixed(2) : null,
    ip: req.ip,
  };

  results.unshift(entry);
  if (results.length > MAX_RESULTS) results.length = MAX_RESULTS;

  res.status(201).json(entry);
});

// ─── Route: Get results ───────────────────────────────────────────────────────

app.get("/api/results", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  res.json(results.slice(0, limit));
});

// ─── Route: Stats ─────────────────────────────────────────────────────────────
// Aggregate statistics over all stored results

app.get("/api/stats", (req, res) => {
  if (results.length === 0) {
    return res.json({ count: 0 });
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const max = (arr) => Math.max(...arr);
  const min = (arr) => Math.min(...arr);

  const dls = results.map((r) => r.download);
  const uls = results.map((r) => r.upload);
  const pings = results.map((r) => r.ping);

  res.json({
    count: results.length,
    download: { avg: +avg(dls).toFixed(2), max: max(dls), min: min(dls) },
    upload: { avg: +avg(uls).toFixed(2), max: max(uls), min: min(uls) },
    ping: { avg: +avg(pings).toFixed(2), max: max(pings), min: min(pings) },
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), resultsStored: results.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Speed test server running on http://localhost:${PORT}`);
  console.log(`Endpoints:
  GET  /api/ping          — latency probe
  GET  /api/download      — download stream (?size=bytes)
  POST /api/upload        — upload receiver (binary body)
  GET  /api/results       — list saved results (?limit=20)
  POST /api/results       — save a result { download, upload, ping, jitter }
  GET  /api/stats         — aggregate stats
  GET  /health            — health check`);
});
