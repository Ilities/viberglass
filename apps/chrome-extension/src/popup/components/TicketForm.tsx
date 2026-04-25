import { useState, useEffect, useCallback } from "react";
import type {
  AuthState,
  CaptureState,
  Project,
  Clanker,
  TicketWorkflowPhase,
  Severity,
  TicketMetadata,
} from "@/types";
import { listProjects, listClankers } from "@/api/projects";
import { createTicket, runPhase } from "@/api/tickets";
import {
  getDefaultProject,
  getDefaultClanker,
  getDefaultPhase,
} from "@/storage";
import { CaptureControls } from "./CaptureControls";
import { MediaPreview } from "./MediaPreview";

interface Props {
  auth: AuthState;
  capture: CaptureState;
  setCapture: React.Dispatch<React.SetStateAction<CaptureState>>;
  onLogout: () => void;
}

const PHASES: { value: TicketWorkflowPhase; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "planning", label: "Planning" },
  { value: "execution", label: "Execution" },
];

const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-700" },
  { value: "medium", label: "Medium", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700" },
];

export function TicketForm({
  auth,
  capture,
  setCapture,
  onLogout,
}: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clankers, setClankers] = useState<Clanker[]>([]);
  const [projectId, setProjectId] = useState("");
  const [clankerId, setClankerId] = useState("");
  const [phase, setPhase] = useState<TicketWorkflowPhase>("research");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [autoRun, setAutoRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ ticketId: string; ticketUrl: string } | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getDefaultProject().then((p) => {
      if (p) setProjectId(p);
    });
    getDefaultClanker().then((c) => {
      if (c) setClankerId(c);
    });
    getDefaultPhase().then((p) => {
      if (p) setPhase(p as TicketWorkflowPhase);
    });
  }, []);

  useEffect(() => {
    if (projectId) {
      listClankers(projectId)
        .then((clankers) => {
          setClankers(clankers);
          if (clankers.length === 1) setClankerId(clankers[0].id);
        })
        .catch(() => setClankers([]));
    } else {
      setClankers([]);
      setClankerId("");
    }
  }, [projectId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);
      setSuccess(null);

      try {
        const metadata: TicketMetadata = {
          browser: {
            name: capture.pageMetadata.browserName,
            version: capture.pageMetadata.browserVersion,
          },
          os: {
            name: capture.pageMetadata.osName,
            version: capture.pageMetadata.osVersion,
          },
          screen: {
            width: capture.pageMetadata.screenWidth,
            height: capture.pageMetadata.screenHeight,
            viewportWidth: capture.pageMetadata.viewportWidth,
            viewportHeight: capture.pageMetadata.viewportHeight,
            pixelRatio: capture.pageMetadata.pixelRatio,
          },
          network: {
            userAgent: capture.pageMetadata.userAgent,
            language: capture.pageMetadata.language,
            cookiesEnabled: capture.pageMetadata.cookiesEnabled,
            onLine: capture.pageMetadata.onLine,
          },
          console: capture.consoleEntries,
          errors: capture.networkErrors.map((ne) => ({
            message: `${ne.method} ${ne.url} → ${ne.status}`,
            timestamp: ne.timestamp,
          })),
          pageUrl: capture.pageMetadata.url,
          referrer: capture.pageMetadata.referrer || undefined,
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const result = await createTicket(
          {
            projectId,
            title: title || capture.pageMetadata.title || "Bug report",
            description:
              description ||
              `Captured from ${capture.pageMetadata.url}`,
            severity,
            category: "bug",
            metadata,
            annotations: capture.annotations,
            autoFixRequested: false,
            ticketSystem: "custom",
            workflowPhase: phase,
          },
          capture.screenshotDataUrl || undefined,
          capture.recordingBlob || undefined,
        );

        const ticketId = result.data.id;
        const platformUrl = (
          await chrome.storage.local.get("viberglass_platform_url")
        ).viberglass_platform_url || "http://localhost:8888";
        const ticketUrl = `${platformUrl}/tickets/${ticketId}`;

        if (autoRun && clankerId) {
          await runPhase(ticketId, phase, clankerId);
        }

        setSuccess({ ticketId, ticketUrl });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create ticket");
      } finally {
        setLoading(false);
      }
    },
    [
      projectId,
      clankerId,
      title,
      description,
      severity,
      phase,
      autoRun,
      capture,
    ],
  );

  if (success) {
    return (
      <div className="p-5">
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Ticket created</h2>
          {autoRun && clankerId && (
            <p className="text-xs text-gray-500 mt-1">
              {phase.charAt(0).toUpperCase() + phase.slice(1)} phase started
            </p>
          )}
        </div>

        <a
          href={success.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2 px-4 text-sm font-medium text-center text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors mb-3"
        >
          Open ticket
        </a>

        <button
          onClick={() => {
            setSuccess(null);
            setTitle("");
            setDescription("");
            setCapture((prev) => ({
              ...prev,
              screenshotDataUrl: null,
              recordingBlob: null,
              annotations: [],
            }));
          }}
          className="w-full py-2 px-4 text-sm text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
        >
          Create another
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-h-[600px] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">New Ticket</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{auth.user.email}</span>
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <CaptureControls
          capture={capture}
          setCapture={setCapture}
        />

        <MediaPreview
          screenshotDataUrl={capture.screenshotDataUrl}
          recordingBlob={capture.recordingBlob}
          onRemoveScreenshot={() =>
            setCapture((prev) => ({ ...prev, screenshotDataUrl: null }))
          }
          onRemoveRecording={() =>
            setCapture((prev) => ({ ...prev, recordingBlob: null }))
          }
        />

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Project
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            required
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {clankers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Worker
            </label>
            <select
              value={clankerId}
              onChange={(e) => setClankerId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="">Select worker</option>
              {clankers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bug description..."
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps to reproduce, expected vs actual behavior..."
            rows={3}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Severity
            </label>
            <div className="flex gap-1">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={`flex-1 py-1 px-1 text-xs font-medium rounded transition-colors ${
                    severity === s.value
                      ? s.color + " ring-1 ring-inset ring-current"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Phase
            </label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value as TicketWorkflowPhase)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              {PHASES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-xs text-gray-700">
            Auto-run {phase} pipeline
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !projectId}
          className="w-full py-2 px-4 text-sm font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Creating..." : "Create ticket"}
        </button>
      </form>
    </div>
  );
}
