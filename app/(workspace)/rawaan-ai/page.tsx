import { BrainChat } from "@/app/components/brain-chat";

export default function RawaanAiPage() {
  return (
    <div className="wireframe-page">
      <header className="wireframe-header">
        <div>
          <h1 className="wireframe-title">Rawaan AI · Patient Context Brain</h1>
          <p className="wireframe-subtitle">
            Natural-language recall strictly grounded in clinician-approved patient records.
          </p>
        </div>
        <div className="safety-label">Documentation support only</div>
      </header>

      <BrainChat />
    </div>
  );
}
