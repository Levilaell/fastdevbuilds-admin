"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { timeAgo } from "@/lib/time-ago";
import { COUNTRIES, getCountry } from "@/lib/bot-config";
import type { CountryConfig } from "@/lib/bot-config";
import type { BotRun } from "@/lib/types";

// ─── Types ───

interface TermLine {
  text: string;
  type: "info" | "success" | "warning" | "error" | "accent";
}

interface QueueItem {
  id: string;
  niche: string;
  city: string;
  limit: number;
  minScore: number;
  country: string;
  dryRun: boolean;
  send: boolean;
}

interface Territory {
  niche: string;
  city: string;
  lead_count: number;
  last_run_at: string | null;
}

interface AutoQueueItem {
  niche: string;
  searchCity: string;
}

interface AutoQueueData {
  stats: {
    total: number;
    prospected: number;
    remaining: number;
    whatsappSentToday: number;
    whatsappSlotsLeft: number;
  };
  queue: AutoQueueItem[];
}

// ─── Helpers ───

function classifyLine(text: string): TermLine["type"] {
  if (text.startsWith("━") || text.includes("━━━")) return "accent";
  if (
    text.includes("❌") ||
    text.toLowerCase().includes("error") ||
    text.toLowerCase().includes("failed")
  )
    return "error";
  if (
    text.includes("✅") ||
    text.toLowerCase().includes("completed") ||
    text.toLowerCase().includes("done")
  )
    return "success";
  if (
    text.includes("⚠") ||
    text.toLowerCase().includes("warning") ||
    text.toLowerCase().includes("skip")
  )
    return "warning";
  return "info";
}

const LINE_COLORS: Record<TermLine["type"], string> = {
  info: "text-[#e0e0e0]",
  success: "text-emerald-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  accent: "text-[#7C3AED]",
};

let nextQueueId = 0;
function queueId(): string {
  return `q-${++nextQueueId}-${Date.now()}`;
}

// ─── Main component ───

export default function BotClient() {
  // Mode toggle — auto is default
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  // Country selection (shared between modes)
  const [country, setCountry] = useState<string>("BR");
  const countryConfig = getCountry(country) as CountryConfig;

  // Auto mode state
  const [autoQueue, setAutoQueue] = useState<AutoQueueData | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoLimit, setAutoLimit] = useState(20);
  const [autoMinScore, setAutoMinScore] = useState(4);
  const [autoSend, setAutoSend] = useState(false);
  const [autoDryRun, setAutoDryRun] = useState(false);
  const [autoMaxSend, setAutoMaxSend] = useState<number | "">("");

  // Manual form state
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const [minScore, setMinScore] = useState(4);
  const [dryRun, setDryRun] = useState(false);
  const [send, setSend] = useState(false);

  // Queue (manual)
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);

  // Territories
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territoryWarning, setTerritoryWarning] = useState<Territory | null>(
    null,
  );

  // Terminal
  const [lines, setLines] = useState<TermLine[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  // History
  const [runs, setRuns] = useState<BotRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // City dropdown ref
  const cityRef = useRef<HTMLDivElement>(null);

  // ─── Computed ───

  const filteredCities = useMemo(() => {
    const cities = countryConfig?.cities ?? [];
    if (!cityQuery) return [...cities];
    const q = cityQuery.toLowerCase();
    return cities.filter((c) => c.toLowerCase().includes(q));
  }, [countryConfig, cityQuery]);

  const running = status === "running";

  // ─── Fetch territories ───

  const fetchTerritories = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/territories");
      if (res.ok) setTerritories(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  // ─── Fetch runs ───

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/runs");
      if (res.ok) setRuns(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const fetchAutoQueue = useCallback(async () => {
    setAutoLoading(true);
    try {
      const res = await fetch(`/api/bot/queue?market=${country}`);
      if (res.ok) setAutoQueue(await res.json());
    } catch {
      /* ignore */
    } finally {
      setAutoLoading(false);
    }
  }, [country]);

  useEffect(() => {
    fetchTerritories();
    fetchRuns();
  }, [fetchTerritories, fetchRuns]);

  // Fetch auto queue when switching to auto mode or changing country
  useEffect(() => {
    if (mode === "auto") fetchAutoQueue();
  }, [mode, country, fetchAutoQueue]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      requestAnimationFrame(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      });
    }
  }, [lines.length]);

  // Close city dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset niche/city when country changes
  useEffect(() => {
    setNiche("");
    setCity("");
    setCityQuery("");
  }, [country]);

  // ─── Territory lookup ───

  function findTerritory(n: string, c: string): Territory | undefined {
    const cityName = c.split(",")[0].trim().toLowerCase();
    return territories.find(
      (t) => t.niche === n && t.city.toLowerCase() === cityName,
    );
  }

  // ─── Add to queue (manual) ───

  function handleAddToQueue() {
    if (!niche.trim() || !city.trim()) return;

    const existing = findTerritory(niche.trim(), city.trim());
    if (existing && !territoryWarning) {
      setTerritoryWarning(existing);
      return;
    }

    setQueue((prev) => [
      ...prev,
      {
        id: queueId(),
        niche: niche.trim(),
        city: city.trim(),
        limit,
        minScore,
        country,
        dryRun,
        send: send && !dryRun,
      },
    ]);
    setTerritoryWarning(null);
  }

  function handleRemoveFromQueue(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  // ─── SSE stream runner (manual) ───

  async function runItem(item: QueueItem): Promise<boolean> {
    const controller = new AbortController();
    abortRef.current = controller;

    setLines((prev) => [
      ...prev,
      { text: `━━━ ${item.niche} / ${item.city} ━━━`, type: "accent" },
      {
        text: `$ prospect-bot --niche "${item.niche}" --city "${item.city}" --limit ${item.limit}`,
        type: "info",
      },
    ]);

    try {
      const res = await fetch("/api/bot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: item.niche,
          city: item.city,
          limit: item.limit,
          min_score: item.minScore,
          country: item.country,
          dry_run: item.dryRun,
          send: item.send,
        }),
        signal: controller.signal,
      });

      if (!res.body) {
        setLines((prev) => [
          ...prev,
          { text: "❌ Sem resposta do servidor", type: "error" },
        ]);
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const payload = part.slice(6);

          if (payload === "[DONE]") {
            return !cancelledRef.current;
          }

          try {
            const parsed = JSON.parse(payload);
            const lineText: string = parsed.line ?? payload;
            const lineType: TermLine["type"] =
              parsed.type ?? classifyLine(lineText);
            setLines((prev) => [...prev, { text: lineText, type: lineType }]);
          } catch {
            setLines((prev) => [
              ...prev,
              { text: payload, type: classifyLine(payload) },
            ]);
          }
        }
      }

      return !cancelledRef.current;
    } catch (err) {
      if (controller.signal.aborted) return false;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLines((prev) => [...prev, { text: `❌ ${msg}`, type: "error" }]);
      return false;
    }
  }

  // ─── Run queue (manual) ───

  async function handleRunQueue() {
    if (running || queue.length === 0) return;

    setStatus("running");
    cancelledRef.current = false;
    setLines([]);

    for (let i = 0; i < queue.length; i++) {
      if (cancelledRef.current) break;
      setRunningIndex(i);
      const ok = await runItem(queue[i]);
      if (!ok && cancelledRef.current) break;
    }

    setRunningIndex(null);
    setStatus(cancelledRef.current ? "error" : "done");
    setQueue([]);
    fetchRuns();
    fetchTerritories();
  }

  // ─── Polling state (auto mode) ───

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serverRunIdRef = useRef<string | null>(null);
  const botRunIdRef = useRef<string | null>(null);
  const lineOffsetRef = useRef(0);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function pollStatus() {
    const serverRunId = serverRunIdRef.current;
    const botRunId = botRunIdRef.current;
    if (!serverRunId) return;

    try {
      const res = await fetch(
        `/api/bot/run-status?runId=${serverRunId}&offset=${lineOffsetRef.current}&botRunId=${botRunId ?? ""}`,
      );
      if (!res.ok) return;

      const data = await res.json();

      if (data.logs && data.logs.length > 0) {
        const newLines: TermLine[] = data.logs.map((text: string) => ({
          text,
          type: classifyLine(text),
        }));
        setLines((prev) => [...prev, ...newLines]);
        lineOffsetRef.current = data.totalLines;
      }

      if (
        data.status === "completed" ||
        data.status === "failed" ||
        data.status === "cancelled"
      ) {
        stopPolling();
        setStatus(data.status === "completed" ? "done" : "error");
        serverRunIdRef.current = null;
        botRunIdRef.current = null;
        fetchRuns();
        fetchAutoQueue();
      }
    } catch {
      /* ignore network hiccups during polling */
    }
  }

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Resume polling on mount if there's a running bot_run
  useEffect(() => {
    if (status !== "idle" || pollingRef.current) return;
    async function checkRunning() {
      try {
        const res = await fetch("/api/bot/runs");
        if (!res.ok) return;
        const allRuns: BotRun[] = await res.json();
        const active = allRuns.find(
          (r) => r.status === "running" && r.server_run_id,
        );
        if (active) {
          serverRunIdRef.current = active.server_run_id ?? null;
          botRunIdRef.current = active.id;
          lineOffsetRef.current = 0;
          setStatus("running");
          setLines([
            {
              text: "━━━ Reconectando ao modo automático em andamento... ━━━",
              type: "accent",
            },
          ]);
          pollingRef.current = setInterval(pollStatus, 5000);
          pollStatus();
        }
      } catch {
        /* ignore */
      }
    }
    checkRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cancel ───

  async function handleCancel() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    stopPolling();
    try {
      await fetch("/api/bot/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: serverRunIdRef.current,
          botRunId: botRunIdRef.current,
        }),
      });
    } catch {
      /* ignore */
    }
    setLines((prev) => [
      ...prev,
      { text: "⚠️ Execução cancelada pelo usuário", type: "warning" },
    ]);
    setStatus("error");
    setRunningIndex(null);
    serverRunIdRef.current = null;
    botRunIdRef.current = null;
  }

  // ─── Run auto mode (fire-and-forget + polling) ───

  async function handleRunAuto() {
    if (running) return;
    setStatus("running");
    cancelledRef.current = false;
    lineOffsetRef.current = 0;
    setLines([
      {
        text: `━━━ Modo Automático — ${countryConfig.flag} ${country} ━━━`,
        type: "accent",
      },
      {
        text: `$ prospect-bot --auto --market ${country} --limit ${autoLimit} --min-score ${autoMinScore}${autoDryRun ? " --dry" : ""}${autoSend && !autoDryRun ? " --send" : ""}${autoMaxSend !== "" ? ` --max-send ${autoMaxSend}` : ""}`,
        type: "info",
      },
    ]);

    try {
      const res = await fetch("/api/bot/run-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: autoLimit,
          min_score: autoMinScore,
          dry_run: autoDryRun,
          send: autoSend && !autoDryRun,
          market: country,
          ...(autoMaxSend !== "" && { max_send: autoMaxSend }),
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        setLines((prev) => [
          ...prev,
          { text: `❌ ${err.error}`, type: "error" },
        ]);
        setStatus("error");
        return;
      }

      const data = await res.json();
      serverRunIdRef.current = data.serverRunId;
      botRunIdRef.current = data.botRunId;

      setLines((prev) => [
        ...prev,
        {
          text: "🤖 Bot iniciado em background — atualizando a cada 5s...",
          type: "info",
        },
      ]);

      // Start polling every 5 seconds
      pollingRef.current = setInterval(pollStatus, 5000);
      // First poll immediately
      setTimeout(pollStatus, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLines((prev) => [...prev, { text: `❌ ${msg}`, type: "error" }]);
      setStatus("error");
    }
  }

  // ─── Fill form from history ───

  function fillFromRun(run: BotRun) {
    if (run.niche) setNiche(run.niche);
    if (run.city) {
      setCity(run.city);
      setCityQuery(run.city);
    }
    if (run.limit_count) setLimit(run.limit_count);
    if (run.min_score) setMinScore(run.min_score);
    if (run.dry_run !== null) setDryRun(run.dry_run);
    if (run.send !== null) setSend(run.send);
  }

  function showRunLog(run: BotRun) {
    const header: TermLine[] = [
      {
        text: `━━━ ${run.niche ?? "?"} / ${run.city ?? "?"} ━━━`,
        type: "accent",
      },
      {
        text: `Status: ${run.status} | Coletados: ${run.collected ?? 0} | Qualificados: ${run.qualified ?? 0} | Enviados: ${run.sent ?? 0} | Duração: ${run.duration_seconds ?? 0}s`,
        type: "info",
      },
    ];
    if (run.log) {
      const logLines: TermLine[] = run.log.split("\n").map((line) => ({
        text: line,
        type: line.startsWith("❌")
          ? ("error" as const)
          : line.startsWith("⚠️")
            ? ("warning" as const)
            : line.startsWith("✅")
              ? ("success" as const)
              : ("info" as const),
      }));
      setLines([...header, ...logLines]);
    } else {
      setLines([
        ...header,
        { text: "(log não disponível para esta execução)", type: "warning" },
      ]);
    }
    setStatus("done");
  }

  // ─── City badge ───

  function cityBadge(cityName: string): Territory | undefined {
    const name = cityName.split(",")[0].trim().toLowerCase();
    return territories.find((t) => t.city.toLowerCase() === name);
  }

  // ─── Render ───

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* ─── Left Panel ─── */}
      <div className="w-[380px] flex-none border-r border-border overflow-y-auto p-5 space-y-5">
        {/* Mode toggle */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
            {mode === "auto" ? "Modo Automático" : "Modo Manual"}
          </h2>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode("auto")}
              className={`px-3 py-1 text-[11px] font-medium ${
                mode === "auto"
                  ? "bg-accent/15 text-accent"
                  : "text-muted bg-sidebar"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`px-3 py-1 text-[11px] font-medium border-l border-border ${
                mode === "manual"
                  ? "bg-accent/15 text-accent"
                  : "text-muted bg-sidebar"
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        {/* Country selector (shared) */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={`flex-1 px-3 py-1.5 text-[11px] font-medium ${
                c.code !== COUNTRIES[0].code ? "border-l border-border" : ""
              } ${
                country === c.code
                  ? "bg-accent/15 text-accent"
                  : "text-muted bg-sidebar hover:text-text"
              }`}
            >
              {c.flag} {c.code}
            </button>
          ))}
        </div>

        {/* Channel indicator */}
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <span className="uppercase tracking-wider">Canal:</span>
          <span
            className={`px-1.5 py-0.5 rounded font-medium ${
              countryConfig.channel === "whatsapp"
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-blue-400 bg-blue-500/10"
            }`}
          >
            {countryConfig.channel === "whatsapp" ? "WhatsApp" : "Email"}
          </span>
        </div>

        {mode === "auto" ? (
          /* ─── Auto Mode Panel ─── */
          <div className="space-y-4">
            {/* Stats */}
            {autoLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : autoQueue ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-muted uppercase">Total</p>
                    <p className="text-lg font-semibold text-text tabular-nums">
                      {autoQueue.stats.total}
                    </p>
                  </div>
                  <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-success uppercase">Feitos</p>
                    <p className="text-lg font-semibold text-success tabular-nums">
                      {autoQueue.stats.prospected}
                    </p>
                  </div>
                  <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-warning uppercase">Fila</p>
                    <p className="text-lg font-semibold text-warning tabular-nums">
                      {autoQueue.stats.remaining}
                    </p>
                  </div>
                </div>

                {/* WhatsApp slots — only for WhatsApp channel countries */}
                {countryConfig.channel === "whatsapp" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted uppercase">
                        WA hoje
                      </p>
                      <p className="text-sm font-medium text-text tabular-nums">
                        {autoQueue.stats.whatsappSentToday}
                      </p>
                    </div>
                    <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted uppercase">
                        Limite (3 inst.)
                      </p>
                      <p className="text-sm font-medium text-text tabular-nums">
                        45
                      </p>
                    </div>
                    <div className="bg-sidebar border border-border rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted uppercase">
                        Slots livres
                      </p>
                      <p
                        className={`text-sm font-medium tabular-nums ${autoQueue.stats.whatsappSlotsLeft > 0 ? "text-success" : "text-danger"}`}
                      >
                        {autoQueue.stats.whatsappSlotsLeft}
                      </p>
                    </div>
                  </div>
                )}

                {/* Queue preview */}
                {autoQueue.queue.length > 0 && (
                  <div className="bg-sidebar border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        Próximos na fila ({autoQueue.stats.remaining})
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-border">
                      {autoQueue.queue.slice(0, 20).map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-1.5 text-xs"
                        >
                          <span className="text-text truncate">
                            {item.niche}
                          </span>
                          <span className="text-muted shrink-0 ml-2">
                            {item.searchCity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted text-center py-4">
                Erro ao carregar fila. Verifique BOT_SERVER_URL.
              </p>
            )}

            {/* Auto params */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Limite/item
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={autoLimit}
                  onChange={(e) => setAutoLimit(Number(e.target.value) || 60)}
                  className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Score mín.
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={autoMinScore}
                  onChange={(e) => setAutoMinScore(Number(e.target.value) || 4)}
                  className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Máx. envios
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Sem limite"
                  value={autoMaxSend}
                  onChange={(e) =>
                    setAutoMaxSend(
                      e.target.value === ""
                        ? ""
                        : Math.max(1, Number(e.target.value)),
                    )
                  }
                  className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
            </div>

            {/* Dry Run + Send toggles */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAutoDryRun(!autoDryRun);
                  if (!autoDryRun) setAutoSend(false);
                }}
                className={`px-3 py-1.5 text-xs rounded-lg border ${
                  autoDryRun
                    ? "border-warning text-warning bg-warning/10"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Dry Run
              </button>
              <button
                onClick={() => {
                  if (!autoDryRun) setAutoSend(!autoSend);
                }}
                disabled={autoDryRun}
                className={`px-3 py-1.5 text-xs rounded-lg border disabled:opacity-30 ${
                  autoSend && !autoDryRun
                    ? "border-success text-success bg-success/10"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Enviar
              </button>
            </div>

            {/* Run / Cancel */}
            {running ? (
              <button
                onClick={handleCancel}
                className="w-full py-2 text-sm font-medium rounded-lg bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancelar
              </button>
            ) : (
              <button
                onClick={handleRunAuto}
                disabled={!autoQueue || autoQueue.stats.remaining === 0}
                className="w-full py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Rodar
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={fetchAutoQueue}
              disabled={autoLoading}
              className="w-full text-center text-[10px] text-muted hover:text-text disabled:opacity-50"
            >
              {autoLoading ? "Carregando..." : "Atualizar fila"}
            </button>
          </div>
        ) : (
          /* ─── Manual Mode Pane ─── */
          <div className="space-y-5">
            {/* Niche */}
            <div>
              <label className="block text-xs text-muted mb-1.5">Nicho</label>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Selecione um nicho</option>
                {countryConfig.niches.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* City with autocomplete */}
            <div ref={cityRef} className="relative">
              <label className="block text-xs text-muted mb-1.5">Cidade</label>
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCity(e.target.value);
                  setCityOpen(true);
                }}
                onFocus={() => setCityOpen(true)}
                placeholder={countryConfig.cities[0] ?? ""}
                className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {cityOpen && filteredCities.length > 0 && (
                <div className="absolute z-40 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-card border border-border rounded-lg shadow-lg">
                  {filteredCities.map((c) => {
                    const badge = cityBadge(c);
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          setCity(c);
                          setCityQuery(c);
                          setCityOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-text hover:bg-card-hover text-left"
                      >
                        <span>{c}</span>
                        {badge && (
                          <span className="text-[10px] text-success flex items-center gap-1 shrink-0 ml-2">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {badge.lead_count} leads ·{" "}
                            {timeAgo(badge.last_run_at)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Limit + Score */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Limite
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 20)}
                  className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Score mín.
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value) || 4)}
                  className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
            </div>

            {/* Dry / Send toggles */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDryRun(!dryRun);
                  if (!dryRun) setSend(false);
                }}
                className={`px-3 py-1.5 text-xs rounded-lg border ${
                  dryRun
                    ? "border-warning text-warning bg-warning/10"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Dry Run
              </button>
              <button
                onClick={() => {
                  if (!dryRun) setSend(!send);
                }}
                disabled={dryRun}
                className={`px-3 py-1.5 text-xs rounded-lg border disabled:opacity-30 ${
                  send && !dryRun
                    ? "border-success text-success bg-success/10"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Enviar
              </button>
            </div>

            {/* Territory warning */}
            {territoryWarning && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs">
                <p className="text-warning font-medium mb-1">
                  Território já prospectado
                </p>
                <p className="text-muted">
                  {territoryWarning.niche} / {territoryWarning.city} —{" "}
                  {territoryWarning.lead_count} leads
                  {territoryWarning.last_run_at
                    ? ` · ${timeAgo(territoryWarning.last_run_at)}`
                    : ""}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      handleAddToQueue();
                    }}
                    className="px-2 py-1 text-[11px] rounded border border-warning text-warning hover:bg-warning/20"
                  >
                    Adicionar mesmo assim
                  </button>
                  <button
                    onClick={() => setTerritoryWarning(null)}
                    className="px-2 py-1 text-[11px] rounded border border-border text-muted hover:text-text"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Add to queue button */}
            <button
              onClick={handleAddToQueue}
              disabled={!niche.trim() || !city.trim() || running}
              className="w-full py-2 text-sm font-medium rounded-lg border border-border text-text hover:bg-card-hover disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Adicionar à fila
            </button>

            {/* Queue list */}
            {queue.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Fila ({queue.length})
                </p>
                {queue.map((item, i) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                      runningIndex === i
                        ? "border-accent bg-accent/5"
                        : "border-border"
                    }`}
                  >
                    {runningIndex === i && (
                      <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin shrink-0" />
                    )}
                    <span className="text-text truncate flex-1">
                      {item.niche} / {item.city}
                    </span>
                    <span className="text-muted shrink-0 font-mono">
                      {item.limit}:{item.minScore}
                    </span>
                    {!running && (
                      <button
                        onClick={() => handleRemoveFromQueue(item.id)}
                        className="text-muted hover:text-danger shrink-0"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Run / Cancel buttons */}
            <div className="flex gap-2">
              {running ? (
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 text-sm font-medium rounded-lg bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 flex items-center justify-center gap-2"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Cancelar
                </button>
              ) : (
                <button
                  onClick={handleRunQueue}
                  disabled={queue.length === 0}
                  className="flex-1 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Rodar Fila ({queue.length})
                </button>
              )}
            </div>
          </div>
          /* end manual mode */
        )}

        {/* History (shared, always visible) */}
        {runs.length > 0 && (
          <div>
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-text w-full"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${historyOpen ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Últimas execuções
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-1">
                {runs.map((run) => {
                  const badge = {
                    running: "text-blue-400 bg-blue-500/10",
                    completed: "text-emerald-400 bg-emerald-500/10",
                    failed: "text-red-400 bg-red-500/10",
                  }[run.status];
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-card-hover group/run"
                    >
                      <button
                        onClick={() => showRunLog(run)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title="Ver log"
                      >
                        <span
                          className={`px-1 py-0.5 rounded text-[10px] shrink-0 ${badge}`}
                        >
                          {run.status}
                        </span>
                        <span className="text-text truncate flex-1">
                          {run.niche ?? "—"} / {run.city ?? "—"}
                        </span>
                        <span className="text-muted shrink-0">
                          {timeAgo(run.started_at)}
                        </span>
                      </button>
                      <button
                        onClick={() => fillFromRun(run)}
                        title="Reusar parâmetros"
                        className="p-0.5 rounded text-muted hover:text-accent opacity-0 group-hover/run:opacity-100 transition-opacity shrink-0"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Terminal (right panel) ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-[#0a0a0a] shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs text-muted font-mono ml-1">
            prospect-bot
          </span>
          {running && (
            <span className="text-[11px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 ml-auto">
              running
            </span>
          )}
          {status === "done" && (
            <span className="text-[11px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 ml-auto">
              done
            </span>
          )}
          {status === "error" && (
            <span className="text-[11px] text-red-400 font-mono px-1.5 py-0.5 rounded bg-red-500/10 ml-auto">
              error
            </span>
          )}
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed bg-[#000]"
        >
          {lines.length === 0 && status === "idle" && (
            <div className="text-muted/40 flex items-center gap-1">
              <span>$</span>
              <span className="animate-[pulse_1s_steps(1)_infinite]">_</span>
            </div>
          )}

          {lines.map((line, i) => (
            <div key={i} className={LINE_COLORS[line.type]}>
              {line.text}
            </div>
          ))}

          {running && (
            <div className="text-muted/40 mt-1 flex items-center gap-1">
              <span className="animate-[pulse_1s_steps(1)_infinite]">_</span>
            </div>
          )}

          {status === "done" && (
            <div className="text-emerald-400 mt-2 border-t border-border/30 pt-2">
              Fila finalizada
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
