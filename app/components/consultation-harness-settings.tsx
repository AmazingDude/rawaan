"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Search,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  listBrainPatientsAction,
  prepareByokBrainQueryAction,
  queryPatientRecordAction,
  type BrainPatient,
} from "@/app/actions";
import type { BrainResponse } from "@/lib/brain/types";
import {
  generateByokGroundedAnswer,
  getStoredGroqByokKey,
} from "@/lib/llm/byok-groq-client";

const HARNESS_SAMPLE_QUESTIONS = [
  "What symptoms were reported in the documented visits?",
  "What plan was discussed in the documented visits?",
  "Were any medications or allergies documented?",
  "What follow-up was documented for this patient?",
  "Summarize the patient's chief complaint and history",
];

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function ConsultationHarnessSettings() {
  const [patients, setPatients] = useState<BrainPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [result, setResult] = useState<BrainResponse | { status: "error"; message: string } | null>(null);
  const [queryLatencyMs, setQueryLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBrainPatientsAction().then((list) => {
      if (!cancelled) {
        setPatients(list);
        if (list.length > 0 && !selectedPatientId) {
          setSelectedPatientId(list[0].patientId);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  async function handleRunTest(customQuestion?: string) {
    const q = (customQuestion ?? question).trim();
    if (!q || !selectedPatientId || isQuerying) return;

    if (customQuestion) setQuestion(customQuestion);

    setIsQuerying(true);
    setResult(null);
    const start = nowMs();

    try {
      const apiKey = getStoredGroqByokKey();
      let res: BrainResponse;

      if (!apiKey) {
        const actionResult = await queryPatientRecordAction(selectedPatientId, q);
        if (actionResult.ok) {
          res = actionResult.response;
        } else {
          setResult({ status: "error", message: actionResult.message });
          setIsQuerying(false);
          setQueryLatencyMs(Math.round(nowMs() - start));
          return;
        }
      } else {
        const preparation = await prepareByokBrainQueryAction(selectedPatientId, q);
        if (!preparation.ok) {
          setResult({ status: "error", message: preparation.message });
          setIsQuerying(false);
          setQueryLatencyMs(Math.round(nowMs() - start));
          return;
        }

        if (preparation.kind === "response") {
          res = preparation.response;
        } else {
          res = await generateByokGroundedAnswer({
            apiKey,
            evidence: preparation.evidence,
            question: preparation.question,
          });
        }
      }

      setResult(res);
    } catch {
      setResult({
        status: "error",
        message: "Failed to run consultation query. Check network or server status.",
      });
    } finally {
      setIsQuerying(false);
      setQueryLatencyMs(Math.round(nowMs() - start));
    }
  }

  const selectedPatient = patients.find((p) => p.patientId === selectedPatientId);

  return (
    <section
      aria-labelledby="consultation-harness-title"
      className="byok-settings-panel"
      style={{ marginTop: "24px" }}
    >
      <div className="byok-settings-heading">
        <div>
          <p className="settings-eyebrow">Diagnostic & Clinical Tools</p>
          <h2 id="consultation-harness-title" style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700 }}>
            Doctor Consultation Harness
          </h2>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: 600,
            background: "#e6f4ea",
            color: "#0f4c3a",
            padding: "4px 10px",
            borderRadius: "12px",
            border: "1px solid #bbf7d0",
          }}
        >
          <Stethoscope size={14} /> Ready for recall
        </span>
      </div>

      <p className="settings-intro">
        Directly test questions against any patient&apos;s approved consultation notes to verify clinical grounding,
        evidence retrieval, and safety boundaries before stepping into a session.
      </p>

      {/* Patient Selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "16px" }}>
        <label htmlFor="harness-patient-select" style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
          Target Patient Record
        </label>
        <select
          id="harness-patient-select"
          className="select-input"
          disabled={isQuerying}
          onChange={(e) => {
            setSelectedPatientId(e.target.value);
            setResult(null);
          }}
          style={{ maxWidth: "420px", fontSize: "14px", padding: "8px 12px" }}
          value={selectedPatientId}
        >
          {patients.map((patient) => (
            <option key={patient.patientId} value={patient.patientId}>
              {patient.displayName} ({patient.patientId})
            </option>
          ))}
        </select>
      </div>

      {/* Quick Test Chips */}
      <div style={{ marginTop: "16px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "12.5px", fontWeight: 600, color: "#64748b" }}>
          Sample Clinical Questions:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {HARNESS_SAMPLE_QUESTIONS.map((sample, idx) => (
            <button
              key={idx}
              className="ghost-button"
              disabled={isQuerying || !selectedPatientId}
              onClick={() => void handleRunTest(sample)}
              style={{
                fontSize: "12.5px",
                padding: "6px 12px",
                borderRadius: "16px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                color: "#1e293b",
                cursor: "pointer",
                textAlign: "left",
              }}
              type="button"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* Query Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleRunTest();
        }}
        style={{ display: "flex", gap: "10px", marginTop: "16px" }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <input
            className="text-input"
            disabled={isQuerying || !selectedPatientId}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              selectedPatient
                ? `Ask anything about ${selectedPatient.displayName}'s documented history…`
                : "Select a patient to query…"
            }
            style={{ width: "100%", paddingLeft: "36px" }}
            type="text"
            value={question}
          />
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
            }}
          />
        </div>
        <button
          className="primary-button"
          disabled={isQuerying || !question.trim() || !selectedPatientId}
          type="submit"
        >
          {isQuerying ? "Evaluating…" : "Run Query"}
          <ArrowRight size={15} />
        </button>
      </form>

      {/* Results Display */}
      {result ? (
        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            borderRadius: "12px",
            border:
              result.status === "supported"
                ? "1px solid #bbf7d0"
                : result.status === "refused"
                  ? "1px solid #cbd5e1"
                  : result.status === "error"
                    ? "1px solid #fecaca"
                    : "1px solid #fed7aa",
            background:
              result.status === "supported"
                ? "#f0fdf4"
                : result.status === "refused"
                  ? "#f8fafc"
                  : result.status === "error"
                    ? "#fef2f2"
                    : "#fffbeb",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {result.status === "supported" ? (
                <>
                  <CheckCircle2 size={18} style={{ color: "#16a34a" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#16a34a" }}>
                    SUPPORTED BY RECORD
                  </span>
                </>
              ) : result.status === "refused" ? (
                <>
                  <ShieldAlert size={18} style={{ color: "#475569" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#475569" }}>
                    REFUSED (SAFETY BOUNDARY)
                  </span>
                </>
              ) : result.status === "error" ? (
                <>
                  <AlertCircle size={18} style={{ color: "#dc2626" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#dc2626" }}>
                    QUERY ERROR
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} style={{ color: "#d97706" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#d97706" }}>
                    NO SUPPORTING RECORD FOUND
                  </span>
                </>
              )}
            </div>

            {queryLatencyMs !== null && (
              <span style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Activity size={13} /> {queryLatencyMs}ms
              </span>
            )}
          </div>

          <p style={{ margin: "0 0 10px", fontSize: "14px", lineHeight: "1.5", color: "#1e293b" }}>
            {result.status === "supported"
              ? result.answer
              : result.status === "error"
                ? result.message
                : result.message}
          </p>

          {result.status === "supported" && result.sources.length > 0 && (
            <div style={{ borderTop: "1px solid #dcfce7", paddingTop: "10px", marginTop: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#166534", display: "flex", alignItems: "center", gap: "6px" }}>
                <FileText size={13} /> Sources Cited:
              </span>
              <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "12px", color: "#374151" }}>
                {result.sources.map((src, i) => (
                  <li key={i}>
                    Consultation on <strong>{src.consultationDate}</strong> (Note: {src.noteId})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* Harness Capabilities Info */}
      <div
        style={{
          marginTop: "20px",
          padding: "14px",
          background: "#f8fafc",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          fontSize: "12.5px",
          color: "#475569",
          lineHeight: "1.5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "#0f4c3a", marginBottom: "4px" }}>
          <Sparkles size={15} /> Grounding & Consultation Safety
        </div>
        Rawaan AI answers strictly from approved clinician records and will explicitly decline if a symptom, medication, or diagnosis was not documented for this patient. This protects clinical consultations against hallucinated treatment suggestions.
      </div>
    </section>
  );
}
