"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { timeAgo } from "@/lib/time-ago";
import { COUNTRIES, getCountry } from "@/lib/bot-config";
import type { CountryConfig } from "@/lib/bot-config";
import type { BotRun } from "@/lib/types";

// ─── Types ───

interface TermLine {
  text: string;
  type: "info" | "success" | "warning" | "error" | "accent";
}

interface AutoQueueItem {
  niche: string;
  searchCity: string;
}

interface InstanceUsage {
  name: string;
  daily_cap: number;
  sent_today: number;
  remaining: number;
  configured: boolean;
}

interface AutoQueueData {
  stats: {
    total: number;
    prospected: number;
    remaining: number;
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

// ─── Main component ───

export default function BotClient() {
  // Country selection
  const [country, setCountry] = useState<string>("BR");
  const countryConfig = getCountry(country) as CountryConfig;

  // Auto mode state
  const [autoQueue, setAutoQueue] = useState<AutoQueueData | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoLimit, setAutoLimit] = useState(20);
  const [autoMinScore, setAutoMinScore] = useState(4);
  const [autoSend, setAutoSend] = useState(false);
  const [autoDryRun, setAutoDryRun] = useState(false);
  // Daily usage + cap per Evolution instance (fetched from /api/bot/instance-usage)
  const [instanceUsage, setInstanceUsage] = useState<InstanceUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  // "How many to send this run" per instance — key = instance name.
  // Required: must be filled (integer >= 0) for all known instances before Run.
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});

  // Inline cap edit state — key = instance name, value = pending edit string
  const [capEdits, setCapEdits] = useState<Record<string, string>>({});
  const [capSaving, setCapSaving] = useState<string | null>(null);

  // Terminal
  const [lines, setLines] = useState<TermLine[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const terminalRef = useRef<HTMLDivElement>(null);

  // Mobile tab (ignored on lg+)
  const [mobileTab, setMobileTab] = useState<"controls" | "terminal">("controls");

  // History
  const [runs, setRuns] = useState<BotRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const running = status === "running";

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

  const fetchInstanceUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const res = await fetch("/api/bot/instance-usage");
      if (res.ok) {
        const data = await res.json();
        const items: InstanceUsage[] = data.instances ?? [];
        setInstanceUsage(items);
        setRunInputs((prev) => {
          const next = { ...prev };
          for (const inst of items) {
            if (next[inst.name] === undefined) next[inst.name] = "";
          }
          return next;
        });
      }
    } catch {
      /* ignore */
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    fetchAutoQueue();
  }, [country, fetchAutoQueue]);

  useEffect(() => {
    if (countryConfig.channel === "whatsapp") fetchInstanceUsage();
  }, [country, countryConfig.channel, fetchInstanceUsage]);

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

  // ─── Polling state ───

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

      if (data.status === "not_found") {
        stopPolling();
        setStatus("error");
        setLines((prev) => [
          ...prev,
          { text: "⚠️  Servidor reiniciou — execução perdida", type: "error" as const },
        ]);
        if (botRunIdRef.current) {
          fetch(`/api/bot/runs/${botRunIdRef.current}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "failed" }),
          }).catch(() => {});
        }
        serverRunIdRef.current = null;
        botRunIdRef.current = null;
        fetchRuns();
        return;
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
        if (countryConfig.channel === "whatsapp") fetchInstanceUsage();
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
    serverRunIdRef.current = null;
    botRunIdRef.current = null;
  }

  // ─── Run auto mode (fire-and-forget + polling) ───

  async function handleRunAuto() {
    if (running) return;

    const willSend = autoSend && !autoDryRun;
    let perInstanceSend: Record<string, number> | undefined;
    if (willSend && countryConfig.channel === "whatsapp") {
      if (instanceUsage.length === 0) {
        alert("Nenhuma instância carregada — aguarde o carregamento das métricas.");
        return;
      }
      const totals: Record<string, number> = {};
      for (const inst of instanceUsage) {
        const raw = runInputs[inst.name] ?? "";
        if (raw === "") {
          alert(`Preencha quantos enviar na instância '${inst.name}' (pode ser 0).`);
          return;
        }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          alert(`Valor inválido para '${inst.name}': deve ser inteiro >= 0.`);
          return;
        }
        if (n > inst.remaining) {
          alert(
            `'${inst.name}' — ${n} excede o disponível hoje (${inst.remaining}).`,
          );
          return;
        }
        totals[inst.name] = n;
      }
      const sum = Object.values(totals).reduce((a, b) => a + b, 0);
      if (sum === 0) {
        alert("Total a enviar é 0. Preencha ao menos uma instância com valor > 0.");
        return;
      }
      perInstanceSend = totals;
    }

    setStatus("running");
    setMobileTab("terminal");
    lineOffsetRef.current = 0;

    const perInstancePreview = perInstanceSend
      ? " " +
        Object.entries(perInstanceSend)
          .map(([n, v]) => `${n}=${v}`)
          .join(",")
      : "";

    setLines([
      {
        text: `━━━ Modo Automático — ${countryConfig.flag} ${country} ━━━`,
        type: "accent",
      },
      {
        text: `$ prospect-bot --auto --market ${country} --limit ${autoLimit} --min-score ${autoMinScore}${autoDryRun ? " --dry" : ""}${willSend ? " --send" : ""}${perInstancePreview ? ` --per-instance${perInstancePreview}` : ""}`,
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
          send: willSend,
          market: country,
          ...(perInstanceSend && { per_instance_send: perInstanceSend }),
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

      pollingRef.current = setInterval(pollStatus, 5000);
      setTimeout(pollStatus, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLines((prev) => [...prev, { text: `❌ ${msg}`, type: "error" }]);
      setStatus("error");
    }
  }

  // ─── Render ───

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)]">
      {/* Mobile tabs */}
      <div className="lg:hidden flex border-b border-border shrink-0">
        <button
          onClick={() => setMobileTab("controls")}
          className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-wide ${
            mobileTab === "controls"
              ? "text-accent border-b-2 border-accent -mb-px"
              : "text-muted hover:text-text"
          }`}
        >
          Controles
        </button>
        <button
          onClick={() => setMobileTab("terminal")}
          className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-wide ${
            mobileTab === "terminal"
              ? "text-accent border-b-2 border-accent -mb-px"
              : "text-muted hover:text-text"
          }`}
        >
          Terminal
          {running && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* ─── Left Panel ─── */}
      <div
        className={`w-full lg:w-[380px] flex-none border-b lg:border-b-0 lg:border-r border-border overflow-y-auto p-5 space-y-5 ${
          mobileTab === "controls" ? "block" : "hidden"
        } lg:block`}
      >
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
          Modo Automático
        </h2>

        {/* Country selector */}
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

              {/* Per-instance daily cap + "send this run" input */}
              {countryConfig.channel === "whatsapp" && instanceUsage.length > 0 && (
                <div className="bg-sidebar border border-border rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted uppercase">Envios hoje</p>
                    {usageLoading && (
                      <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    )}
                  </div>
                  <div className="space-y-2">
                    {instanceUsage.map((inst) => {
                      const editing = capEdits[inst.name] !== undefined;
                      const runVal = runInputs[inst.name] ?? "";
                      const runNum = runVal === "" ? null : Number(runVal);
                      const overLimit =
                        runNum !== null && runNum > inst.remaining;
                      return (
                        <div
                          key={inst.name}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="text-text/70 truncate flex-1 min-w-0">
                            {inst.name}
                          </span>
                          {editing ? (
                            <span className="flex items-center gap-1">
                              <span className="text-text tabular-nums">
                                {inst.sent_today}/
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={500}
                                value={capEdits[inst.name]}
                                onChange={(e) =>
                                  setCapEdits({
                                    ...capEdits,
                                    [inst.name]: e.target.value,
                                  })
                                }
                                disabled={capSaving === inst.name}
                                className="w-12 h-6 px-1 text-xs rounded bg-background border border-border text-text tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              <button
                                onClick={async () => {
                                  const raw = capEdits[inst.name];
                                  const n = Number(raw);
                                  if (!Number.isInteger(n) || n < 0 || n > 500) return;
                                  setCapSaving(inst.name);
                                  try {
                                    await fetch("/api/bot/instance-cap", {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        instance_name: inst.name,
                                        daily_cap: n,
                                      }),
                                    });
                                    await fetchInstanceUsage();
                                    const next = { ...capEdits };
                                    delete next[inst.name];
                                    setCapEdits(next);
                                  } finally {
                                    setCapSaving(null);
                                  }
                                }}
                                disabled={capSaving === inst.name}
                                className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 px-1"
                                title="Salvar"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => {
                                  const next = { ...capEdits };
                                  delete next[inst.name];
                                  setCapEdits(next);
                                }}
                                disabled={capSaving === inst.name}
                                className="text-muted hover:text-text disabled:opacity-40 px-1"
                                title="Cancelar"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                setCapEdits({
                                  ...capEdits,
                                  [inst.name]: String(inst.daily_cap),
                                })
                              }
                              className="text-text/80 hover:text-accent tabular-nums"
                              title="Editar cap diário"
                            >
                              {inst.sent_today}/{inst.daily_cap}
                            </button>
                          )}
                          <input
                            type="number"
                            min={0}
                            max={inst.remaining}
                            placeholder="0"
                            value={runVal}
                            onChange={(e) =>
                              setRunInputs({
                                ...runInputs,
                                [inst.name]: e.target.value,
                              })
                            }
                            className={`w-14 h-7 px-2 text-xs rounded border text-text tabular-nums focus:outline-none focus:ring-1 focus:ring-accent ${
                              overLimit
                                ? "border-red-500 bg-red-500/5"
                                : "border-border bg-background"
                            }`}
                            title={`Máx: ${inst.remaining}`}
                          />
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border">
                      <span className="text-xs text-muted">Total a enviar</span>
                      <span className="text-xs font-semibold text-text tabular-nums">
                        {Object.values(runInputs).reduce(
                          (acc, v) => acc + (Number(v) || 0),
                          0,
                        )}
                      </span>
                    </div>
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
          <div className="grid grid-cols-2 gap-3">
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
              disabled={
                !autoQueue ||
                autoQueue.stats.remaining === 0 ||
                (autoSend &&
                  !autoDryRun &&
                  countryConfig.channel === "whatsapp" &&
                  (instanceUsage.length === 0 ||
                    instanceUsage.some(
                      (i) =>
                        runInputs[i.name] === undefined ||
                        runInputs[i.name] === "" ||
                        Number(runInputs[i.name]) > i.remaining ||
                        Number.isNaN(Number(runInputs[i.name])),
                    ) ||
                    Object.values(runInputs).reduce(
                      (a, v) => a + (Number(v) || 0),
                      0,
                    ) === 0))
              }
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

        {/* History */}
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
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                    >
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] shrink-0 ${badge}`}
                      >
                        {run.status}
                      </span>
                      <span className="text-muted shrink-0 ml-auto">
                        {timeAgo(run.started_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Terminal (right panel) ─── */}
      <div
        className={`flex-1 flex-col min-w-0 ${
          mobileTab === "terminal" ? "flex" : "hidden"
        } lg:flex`}
      >
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
