import Link from "next/link";

export default function RawaanAiPage() {
  return (
    <div className="wireframe-page">
      <header className="wireframe-header">
        <div>
          <div className="wireframe-badge">WIREFRAME VIEW</div>
          <h1 className="wireframe-title">Rawaan AI · Patient Context Brain</h1>
          <p className="wireframe-subtitle">
            Natural-language recall strictly grounded in clinician-approved patient records.
          </p>
        </div>
        <div className="safety-label">Documentation support only</div>
      </header>

      <div className="wireframe-notice-banner">
        <span className="notice-icon">🧠</span>
        <p>
          <strong>UI Wireframe Mode:</strong> The server-side Brain engine (retrieval,
          safety gate & citation verification) is built in <code>lib/brain/</code>. Full
          live UI binding will be connected in the next phase. Active Scribe is live on
          the <Link href="/record"><strong>Record</strong></Link> page.
        </p>
      </div>

      <section className="brain-wireframe-container">
        <div className="brain-query-card">
          <div className="brain-card-header">
            <h3>Ask a question about a patient</h3>
            <span className="status-chip neutral">Patient-isolated search</span>
          </div>

          <div className="brain-input-group">
            <label className="form-field">
              Select Patient Record
              <select className="select-input" defaultValue="patient-amina-001" disabled>
                <option value="patient-amina-001">Amina Khan (patient-amina-001)</option>
                <option value="patient-tariq-002">Tariq Mahmood (patient-tariq-002)</option>
                <option value="patient-gloria-003">Carl Rogers & Gloria (patient-gloria-003)</option>
              </select>
            </label>

            <div className="sample-prompts-section">
              <span className="sample-label">Sample queries for this patient:</span>
              <div className="sample-chips">
                <span className="sample-chip">“Has she mentioned chest pain before?”</span>
                <span className="sample-chip">“What symptoms were discussed in past visits?”</span>
                <span className="sample-chip is-safety">“What medication should we prescribe? (Safety Refusal)”</span>
              </div>
            </div>

            <label className="form-field">
              Natural Language Question
              <textarea
                className="brain-textarea"
                disabled
                placeholder="Ask about symptoms, history, or past discussions... (Wireframe preview)"
                rows={3}
                value="Has she mentioned chest pain before?"
                readOnly
              />
            </label>

            <div className="brain-actions-row">
              <button className="primary-button" disabled type="button">
                Ask Rawaan AI
              </button>
            </div>
          </div>
        </div>

        {/* Sample Result Preview Card */}
        <div className="brain-result-card">
          <div className="result-card-heading">
            <div>
              <span className="eyebrow">GROUNDED RECALL RESULT</span>
              <h4>Grounded Answer & Citation Provenance</h4>
            </div>
            <span className="status-chip approved">Supported · Grounded</span>
          </div>

          <div className="result-answer-content">
            <p className="answer-text">
              Yes — chest pain was documented on exertion during the consultation on <strong>June 1, 2026</strong>. The patient reported discomfort when climbing stairs, which subsided with rest.
            </p>

            <div className="citations-box">
              <span className="citations-label">Source Notes Cited (Strict provenance):</span>
              <div className="citation-tags">
                <span className="citation-tag">
                  📄 Note #note-chest-001 · 2026-06-01
                </span>
                <span className="citation-tag">
                  📄 Note #note-followup-002 · 2026-07-15
                </span>
              </div>
            </div>

            <div className="evidence-excerpts-preview">
              <span className="excerpts-title">Retrieved Evidence Excerpts:</span>
              <blockquote>
                &quot;Patient reported chest pain when climbing stairs. Advised ECG and symptom diary.&quot;
              </blockquote>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
