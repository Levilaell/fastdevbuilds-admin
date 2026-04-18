"use client";

import { useState } from "react";
import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "@/lib/types";

const fmtCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface Props {
  project: Project;
  placeId: string;
}

const FLOW: ProjectStatus[] = [
  "scoped",
  "approved",
  "in_progress",
  "delivered",
  "client_approved",
  "paid",
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[10px] text-muted hover:text-text px-1.5 py-0.5 rounded border border-border shrink-0"
    >
      {copied ? "Copiado!" : (label ?? "Copiar")}
    </button>
  );
}

function PromptSection({
  project,
  placeId,
  onProjectUpdate,
}: {
  project: Project;
  placeId: string;
  onProjectUpdate: (p: Project) => void;
}) {
  const [promptVisible, setPromptVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [msgVisible, setMsgVisible] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [sendingInfo, setSendingInfo] = useState(false);
  const [infoSent, setInfoSent] = useState(false);

  let placeholders: string[] = [];
  if (project.pending_info) {
    try {
      placeholders = JSON.parse(project.pending_info) as string[];
    } catch {
      placeholders = [project.pending_info];
    }
  }

  async function handleGeneratePrompt() {
    setGeneratingPrompt(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/generate-prompt`,
        { method: "POST" },
      );
      if (res.ok) {
        // Re-fetch full project to get all new fields
        const projRes = await fetch(
          `/api/projects/${encodeURIComponent(placeId)}/status`,
        );
        if (projRes.ok) {
          const updated = await projRes.json();
          if (updated) onProjectUpdate(updated);
        }
      }
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function handleSendInfoRequest() {
    if (!project.info_request_message) return;
    setSendingInfo(true);
    try {
      const res = await fetch("/api/conversations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: placeId,
          message: project.info_request_message,
          channel: "whatsapp",
        }),
      });
      if (res.ok) setInfoSent(true);
    } finally {
      setSendingInfo(false);
    }
  }

  if (!project.claude_code_prompt) {
    return (
      <button
        onClick={handleGeneratePrompt}
        disabled={generatingPrompt}
        className="w-full py-2 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50"
      >
        {generatingPrompt ? "Gerando prompt…" : "Gerar prompt Claude Code"}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1. Prompt for Claude Code */}
      <div className="bg-sidebar border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs text-accent font-medium">
            Prompt para Claude Code
          </span>
          <div className="flex items-center gap-2">
            {project.prompt_updated_at && (
              <span className="text-[9px] text-muted">
                {new Date(project.prompt_updated_at).toLocaleDateString(
                  "pt-BR",
                )}
              </span>
            )}
            <CopyButton text={project.claude_code_prompt} />
          </div>
        </div>
        {promptVisible ? (
          <div className="relative">
            <pre className="p-3 text-xs text-text/80 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {project.claude_code_prompt}
            </pre>
            <button
              onClick={() => setPromptVisible(false)}
              className="absolute top-2 right-2 text-[10px] text-muted hover:text-text"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-3">
            <p className="text-xs text-text/60 line-clamp-3">
              {project.claude_code_prompt.slice(0, 200)}…
            </p>
            <button
              onClick={() => setPromptVisible(true)}
              className="text-[10px] text-accent hover:underline mt-1"
            >
              Ver prompt completo
            </button>
          </div>
        )}
      </div>

      {/* 2. Pending info / placeholders */}
      {placeholders.length > 0 && (
        <div className="bg-sidebar border border-warning/20 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-warning/20">
            <span className="text-xs text-warning font-medium">
              Informações pendentes
            </span>
            <span className="text-[9px] text-warning/60">
              {placeholders.length}{" "}
              {placeholders.length === 1 ? "item" : "itens"}
            </span>
          </div>
          {infoVisible ? (
            <ul className="p-3 space-y-1.5">
              {placeholders.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-text/80"
                >
                  <span className="text-warning/60 mt-0.5 shrink-0">
                    {i + 1}.
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3">
              <p className="text-xs text-text/60">
                {placeholders.slice(0, 3).join(", ")}
                {placeholders.length > 3 ? `… +${placeholders.length - 3}` : ""}
              </p>
              <button
                onClick={() => setInfoVisible(true)}
                className="text-[10px] text-warning hover:underline mt-1"
              >
                Ver todos
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Info request message for client */}
      {project.info_request_message && (
        <div className="bg-sidebar border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs text-emerald-400 font-medium">
              Mensagem para o cliente
            </span>
            <CopyButton text={project.info_request_message} />
          </div>
          {msgVisible ? (
            <div className="p-3 text-xs text-text/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {project.info_request_message}
            </div>
          ) : (
            <div className="p-3">
              <p className="text-xs text-text/60 line-clamp-2">
                {project.info_request_message.slice(0, 150)}…
              </p>
              <button
                onClick={() => setMsgVisible(true)}
                className="text-[10px] text-emerald-400 hover:underline mt-1"
              >
                Ver mensagem
              </button>
            </div>
          )}
          {!infoSent ? (
            <div className="px-3 pb-3">
              <button
                onClick={handleSendInfoRequest}
                disabled={sendingInfo}
                className="w-full py-1.5 text-xs font-medium rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {sendingInfo
                  ? "Enviando…"
                  : "Enviar pedido de informações via WhatsApp"}
              </button>
            </div>
          ) : (
            <div className="px-3 pb-3">
              <span className="text-[10px] text-success">Mensagem enviada</span>
            </div>
          )}
        </div>
      )}

      {/* Regenerate prompt */}
      <button
        onClick={handleGeneratePrompt}
        disabled={generatingPrompt}
        className="text-[10px] text-muted hover:text-text"
      >
        {generatingPrompt ? "Regenerando…" : "Regenerar prompt"}
      </button>
    </div>
  );
}

export default function ProjectStatusSection({
  project: initial,
  placeId,
}: Props) {
  const [project, setProject] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  const status = project.status as ProjectStatus;
  const currentIdx = FLOW.indexOf(status);

  // Show prompt section at 'approved' and later stages
  const showPromptSection =
    currentIdx >= FLOW.indexOf("approved") &&
    status !== "paid" &&
    status !== "cancelled";

  async function advanceStatus(newStatus: ProjectStatus) {
    const label = PROJECT_STATUS_LABELS[newStatus];
    if (!confirm(`Avançar projeto para "${label}"?`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao atualizar status");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPreview() {
    if (!previewUrl.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/conversations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: placeId,
          message: `Olá! Aqui está o preview do seu novo site: ${previewUrl}`,
          channel: "whatsapp",
        }),
      });
      await advanceStatus("delivered");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
        Status do Projeto
      </h2>

      {/* Status flow */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {FLOW.map((s, i) => {
          const isActive = s === status;
          const isPast = i < currentIdx;
          return (
            <div key={s} className="flex items-center gap-1 shrink-0">
              {i > 0 && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={isPast ? "text-success" : "text-border"}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isActive
                    ? "bg-accent/15 text-accent font-semibold"
                    : isPast
                      ? "text-success bg-success/10"
                      : "text-muted bg-border/50"
                }`}
              >
                {PROJECT_STATUS_LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Contextual actions */}
      {status === "scoped" && (
        <button
          onClick={() => advanceStatus("approved")}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? "Atualizando…" : "Cliente autorizou →"}
        </button>
      )}

      {/* Prompt section — visible from 'approved' onwards */}
      {showPromptSection && (
        <PromptSection
          project={project}
          placeId={placeId}
          onProjectUpdate={setProject}
        />
      )}

      {status === "approved" && (
        <button
          onClick={() => advanceStatus("in_progress")}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? "Atualizando…" : "Marcar em progresso →"}
        </button>
      )}

      {status === "in_progress" && (
        <div className="space-y-3">
          {/* Preview URL */}
          <input
            type="url"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            placeholder="https://preview.vercel.app/..."
            className="w-full h-8 px-3 text-xs rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleSendPreview}
            disabled={loading || !previewUrl.trim()}
            className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            {loading ? "Enviando…" : "Enviar link de preview →"}
          </button>
        </div>
      )}

      {status === "delivered" && (
        <button
          onClick={() => advanceStatus("client_approved")}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? "Atualizando…" : "Cliente aprovou →"}
        </button>
      )}

      {status === "client_approved" && (
        <button
          onClick={() => advanceStatus("paid")}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-success hover:bg-success/80 text-white disabled:opacity-50"
        >
          {loading ? "Atualizando…" : "Marcar como pago →"}
        </button>
      )}

      {status === "paid" && (
        <div className="flex items-center gap-2 text-xs text-success">
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
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Projeto pago — {fmtCurrency.format(project.price ?? 0)}
        </div>
      )}

      {status === "cancelled" && (
        <p className="text-xs text-danger">Projeto cancelado</p>
      )}
    </div>
  );
}
