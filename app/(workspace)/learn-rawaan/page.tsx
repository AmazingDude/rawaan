import { Brain, Mic, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

const guideModules = [
  {
    icon: Mic,
    title: "1. Consultation Scribe",
    description:
      "Capture consultation audio or type transcripts to generate structured SOAP-style clinical notes. Every draft requires explicit clinician review and approval before persisting.",
    bullets: [
      "Turn-based audio recording with consent validation",
      "Field-by-field review (Subjective, Assessment & Plan, Follow-up)",
      "Strict provenance linking draft fields to raw transcripts",
    ],
  },
  {
    icon: Brain,
    title: "2. Patient Context Brain",
    description:
      "Ask natural-language questions about past consultations. Answers are strictly grounded in retrieved approved notes with zero hallucination.",
    bullets: [
      "Code-level patient data isolation before retrieval",
      "Explicit 'No record of that' rejection for unrecorded facts",
      "Citation transparency: every answer cites source note IDs and dates",
    ],
  },
  {
    icon: ShieldCheck,
    title: "3. Safety Guardrails & Non-Goals",
    description:
      "Rawaan is an administrative and documentation assistant, not a diagnostic or treatment prescription system.",
    bullets: [
      "Immediate refusal of diagnosis or treatment queries",
      "Clinician approval gate protects medical record integrity",
      "Fictional demo data only for testing and training",
    ],
  },
  {
    icon: Zap,
    title: "4. Best Practices & Workflow Tips",
    description:
      "Maximize documentation speed in high-volume clinics and therapy sessions.",
    bullets: [
      "Use labeled transcript lines for rapid local parsing",
      "Review draft summaries before signing off",
      "Use Brain recall before starting follow-up consultations",
    ],
  },
];

export default function LearnRawaanPage() {
  return (
    <div className="wireframe-page">
      <header className="wireframe-header">
        <div>
          <div className="wireframe-badge">LEARNING CENTER</div>
          <h1 className="wireframe-title">Learn Rawaan</h1>
          <p className="wireframe-subtitle">
            A comprehensive clinician guide to the Scribe capture workflow and Patient Context Brain.
          </p>
        </div>
        <div className="wireframe-header-actions">
          <Link className="primary-button" href="/record">
            Open Scribe Workspace
          </Link>
        </div>
      </header>

      <section className="learn-grid">
        {guideModules.map((module) => {
          const ModuleIcon = module.icon;
          return (
          <article className="learn-module-card" key={module.title}>
            <div className="module-header">
              <span className="module-icon">
                <ModuleIcon aria-hidden="true" size={20} />
              </span>
              <h3 className="module-title">{module.title}</h3>
            </div>
            <p className="module-desc">{module.description}</p>
            <ul className="module-bullets">
              {module.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </article>
          );
        })}
      </section>

      <section className="learn-cta-card">
        <div className="cta-content">
          <h3>Ready to record a consultation?</h3>
          <p>
            Jump right into the Record studio to capture your first roleplayed consultation.
          </p>
        </div>
        <Link className="primary-button" href="/record">
          Start Recording Now
        </Link>
      </section>
    </div>
  );
}
