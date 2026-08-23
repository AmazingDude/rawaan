import Link from "next/link";

export function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-frame">
          <nav className="landing-nav" aria-label="Rawaan navigation">
            <Link className="landing-wordmark" href="/" aria-label="Rawaan home">
              RAWAAN
            </Link>
            <p className="landing-product">Patient Context Engine</p>
            <p className="landing-nav-note">Documentation support only</p>
          </nav>

          <div className="landing-content">
            <p className="landing-intro">A clinician-controlled documentation flow</p>
            <h1 id="landing-title">Notes that stay with the patient.</h1>
            <p className="landing-summary">
              Rawaan turns a fictional consultation transcript into a structured
              note for clinician review, editing, and explicit approval.
            </p>
            <Link className="landing-demo-link" href="/scribe">
              Try the Demo
            </Link>
          </div>

          <div className="landing-sequence" aria-label="Transcript, review, approved note">
            <span>Transcript</span>
            <span>Clinician review</span>
            <span>Approved note</span>
          </div>

          <p className="landing-disclaimer">
            Built for fictional demo consultations. No diagnosis or treatment guidance.
          </p>
        </div>
      </section>
    </main>
  );
}
