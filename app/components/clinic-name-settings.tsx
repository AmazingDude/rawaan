"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { updateClinicNameAction } from "@/app/actions";

export function ClinicNameSettings({ initialClinicName }: { initialClinicName: string }) {
  const router = useRouter();
  const [clinicName, setClinicName] = useState(initialClinicName);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await updateClinicNameAction(clinicName);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setClinicName(result.clinicName);
      setMessage("Clinic name saved.");
      router.refresh();
    } catch {
      setError("Could not save the clinic name. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="clinic-name-title" className="settings-card clinic-name-settings">
      <div className="settings-card-heading">
        <div>
          <p className="settings-eyebrow">Workspace identity</p>
          <h2 id="clinic-name-title">Clinic name</h2>
        </div>
      </div>
      <p className="settings-intro">This name appears in your workspace sidebar.</p>
      <form className="clinic-name-form" onSubmit={handleSubmit}>
        <label htmlFor="clinic-name-input">Name</label>
        <div className="clinic-name-controls">
          <input
            autoComplete="organization"
            id="clinic-name-input"
            maxLength={80}
            onChange={(event) => setClinicName(event.currentTarget.value)}
            required
            value={clinicName}
          />
          <button className="primary-button" disabled={isSaving || !clinicName.trim()} type="submit">
            {isSaving ? "Saving…" : "Save clinic name"}
          </button>
        </div>
        {error ? <p className="clinic-name-feedback is-error" role="alert">{error}</p> : null}
        {message ? <p className="clinic-name-feedback" role="status">{message}</p> : null}
      </form>
    </section>
  );
}
