import { BrainGroundingSettings } from "@/app/components/brain-grounding-settings";
import { ConsultationHarnessSettings } from "@/app/components/consultation-harness-settings";
import { ClinicNameSettings } from "@/app/components/clinic-name-settings";
import { requireUserClinicProfile } from "@/lib/auth/session";

export default async function SettingsPage() {
  const { clinicName } = await requireUserClinicProfile();
  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <div className="settings-page-header">
        <p className="settings-eyebrow">Workspace settings</p>
        <h1 id="settings-page-title">Settings</h1>
        <p>Review Brain answer behavior and test approved-note retrieval.</p>
      </div>
      <ClinicNameSettings initialClinicName={clinicName} />
      <BrainGroundingSettings />
      <ConsultationHarnessSettings />
    </section>
  );
}
