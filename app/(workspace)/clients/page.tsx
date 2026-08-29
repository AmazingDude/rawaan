import { ArrowUpRight, Users } from "lucide-react";
import Link from "next/link";

import { listBrainPatientsAction } from "@/app/actions";

// The roster reflects the live approved-note store, which changes when a
// clinician approves a note during a session. Force per-request rendering so
// newly approved patients appear without a rebuild.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const patients = await listBrainPatientsAction();

  return (
    <div className="wireframe-page page-clients">
      <header className="wireframe-header">
        <div>
          <h1 className="wireframe-title">Clients Directory</h1>
          <p className="wireframe-subtitle">
            Patient roster derived from approved consultation notes.
          </p>
        </div>
        <div className="wireframe-header-actions">
          <Link className="primary-button" href="/record">
            + New Consultation
          </Link>
        </div>
      </header>

      {patients.length === 0 ? (
        <div className="roster-empty-state">
          <span className="empty-state-icon" aria-hidden="true">
            <Users size={22} />
          </span>
          <p className="roster-empty-title">No patients yet</p>
          <p className="roster-empty-body">
            Approve a consultation note on the{" "}
            <Link className="roster-empty-link" href="/record">
              Record
            </Link>{" "}
            page to see patients here.
          </p>
        </div>
      ) : (
        <section className="client-cards-grid" aria-label="Clients list">
          {patients.map((patient) => (
            <article className="client-card" key={patient.patientId}>
              <div className="client-card-header">
                <div className="client-avatar">
                  {patient.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="client-meta">
                  <h3 className="client-name">{patient.displayName}</h3>
                  <span className="client-id">{patient.patientId}</span>
                </div>
              </div>

              <div className="client-card-body">
                <div className="client-stat-row">
                  <span className="stat-label">Approved Notes:</span>
                  <span className="stat-value">
                    {patient.approvedNoteCount}{" "}
                    {patient.approvedNoteCount === 1 ? "note" : "notes"}
                  </span>
                </div>
                <div className="client-stat-row">
                  <span className="stat-label">Last Consultation:</span>
                  <span className="stat-value">
                    {patient.mostRecentConsultationDate}
                  </span>
                </div>
              </div>

              <div className="client-card-footer">
                <Link className="ghost-button" href="/record">
                  Start Session
                </Link>
                <Link className="secondary-button" href="/rawaan-ai">
                  Query with Brain
                  <ArrowUpRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
