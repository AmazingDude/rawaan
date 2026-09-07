import { ByokSettings } from "@/app/components/byok-settings";
import { ConsultationHarnessSettings } from "@/app/components/consultation-harness-settings";

export default function SettingsPage() {
  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-header">
        <p className="settings-eyebrow">Workspace settings</p>
        <h1 id="settings-page-title">Settings</h1>
        <p>Configure clinician recall parameters and consultation tools.</p>
      </div>
      <ByokSettings />
      <ConsultationHarnessSettings />
    </section>
  );
}
