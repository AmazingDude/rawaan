import Link from "next/link";

const workflowSteps = [
  {
    description: "Enter a fictional consultation transcript.",
    label: "Transcript",
    number: "01",
    tone: "neutral",
  },
  {
    description: "Edit the structured draft field by field.",
    label: "Clinician review",
    number: "02",
    tone: "review",
  },
  {
    description: "Save the clinician-approved note.",
    label: "Approved note",
    number: "03",
    tone: "approved",
  },
] as const;

export function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-frame">
          <nav className="landing-nav" aria-label="Rawaan navigation">
            <Link className="landing-brand-lockup" href="/" aria-label="Rawaan home">
              <span className="landing-wordmark">RAWAAN</span>
              <span className="landing-product">Patient Context Engine</span>
            </Link>
            <span className="landing-nav-note safety-label">
              Documentation support only
            </span>
          </nav>

          <div className="landing-content">
            <p className="landing-intro">A clinician-controlled documentation flow</p>
            <h1 id="landing-title">
              Notes that stay with the <span className="landing-headline-accent">patient.</span>
            </h1>
            <p className="landing-summary">
              Rawaan turns a fictional consultation transcript into a structured
              note for clinician review, editing, and explicit approval.
            </p>
            <Link className="landing-demo-link" href="/scribe">
              Try the Demo
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-workflow-frame">
          <div className="landing-workflow-intro">
            <h2 id="workflow-title">From transcript to an approved note.</h2>
            <p>Every record remains visible, reviewable, and clinician-controlled.</p>
          </div>

          <ol className="landing-workflow-steps">
            {workflowSteps.map((step) => (
              <li className="landing-workflow-step step-card" key={step.number}>
                <span className={`landing-step-number ${step.tone}`}>{step.number}</span>
                <h3>{step.label}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="landing-disclaimer">
            Built for fictional demo consultations. No diagnosis or treatment guidance.
          </p>
        </div>
      </section>
    </main>
  );
}
