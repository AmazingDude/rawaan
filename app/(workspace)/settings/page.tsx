import { ByokSettings } from "@/app/components/byok-settings";

export default function SettingsPage() {
  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-header">
        <p className="settings-eyebrow">Workspace settings</p>
        <h1 id="settings-page-title">Settings</h1>
        <p>Choose how Rawaan AI uses Groq for Brain answers.</p>
      </div>
      <ByokSettings />
    </section>
  );
}
