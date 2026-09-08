export function BrainGroundingSettings() {
  return (
    <section aria-labelledby="brain-grounding-title" className="settings-card">
      <div className="settings-card-heading">
        <div>
          <p className="settings-eyebrow">Rawaan AI</p>
          <h2 id="brain-grounding-title">Brain answer behavior</h2>
        </div>
      </div>
      <p className="settings-intro">
        Brain answers contain verbatim excerpts selected from this patient&apos;s approved notes, with citations to the same notes.
      </p>
      <p>Brain does not generate answer prose or use a personal Groq API key. When retrieval finds no relevant excerpt, it says there is no record.</p>
    </section>
  );
}
