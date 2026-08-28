import Link from "next/link";

const demoClients = [
  {
    id: "patient-amina-001",
    name: "Amina Khan",
    age: "34",
    totalSessions: 3,
    lastVisit: "August 20, 2026",
    primaryComplaint: "Tension headache & exertion chest pain",
    status: "Active",
  },
  {
    id: "patient-tariq-002",
    name: "Tariq Mahmood",
    age: "52",
    totalSessions: 2,
    lastVisit: "July 02, 2026",
    primaryComplaint: "Type 2 Diabetes routine follow-up & neuropathy",
    status: "Active",
  },
  {
    id: "patient-gloria-003",
    name: "Carl Rogers & Gloria",
    age: "41",
    totalSessions: 1,
    lastVisit: "August 27, 2026",
    primaryComplaint: "Therapy session exploring personal congruence",
    status: "Follow-up required",
  },
  {
    id: "patient-fatima-004",
    name: "Fatima Noor",
    age: "28",
    totalSessions: 1,
    lastVisit: "August 10, 2026",
    primaryComplaint: "Seasonal allergic rhinitis & asthma triggers",
    status: "Active",
  },
];

export default function ClientsPage() {
  return (
    <div className="wireframe-page">
      <header className="wireframe-header">
        <div>
          <div className="wireframe-badge">WIREFRAME VIEW</div>
          <h1 className="wireframe-title">Clients Directory</h1>
          <p className="wireframe-subtitle">
            View patient profiles, consultation records, and history summaries.
          </p>
        </div>
        <div className="wireframe-header-actions">
          <Link className="primary-button" href="/record">
            + New Consultation
          </Link>
        </div>
      </header>

      <section className="wireframe-search-bar">
        <div className="search-pill-wrapper">
          <svg
            aria-hidden="true"
            className="search-icon"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
          </svg>
          <input
            className="search-pill-input"
            disabled
            placeholder="Search by client name or ID... (Wireframe preview)"
            type="text"
          />
        </div>
        <div className="wireframe-filter-tags">
          <span className="filter-pill is-active">All Clients (4)</span>
          <span className="filter-pill">Active (3)</span>
          <span className="filter-pill">Follow-up (1)</span>
        </div>
      </section>

      <div className="wireframe-notice-banner">
        <span className="notice-icon">ℹ️</span>
        <p>
          <strong>UI Wireframe Mode:</strong> Client roster and profile editing will
          be fully connected to storage in the next phase. Active consultation capture
          is ready on the <strong>Record</strong> tab.
        </p>
      </div>

      <section className="client-cards-grid" aria-label="Clients list">
        {demoClients.map((client) => (
          <article className="client-card" key={client.id}>
            <div className="client-card-header">
              <div className="client-avatar">
                {client.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="client-meta">
                <h3 className="client-name">{client.name}</h3>
                <span className="client-id">{client.id}</span>
              </div>
              <span className={`client-status-badge ${client.status === "Active" ? "is-active" : "is-followup"}`}>
                {client.status}
              </span>
            </div>

            <div className="client-card-body">
              <div className="client-stat-row">
                <span className="stat-label">Total Visits:</span>
                <span className="stat-value">{client.totalSessions} sessions</span>
              </div>
              <div className="client-stat-row">
                <span className="stat-label">Last Consultation:</span>
                <span className="stat-value">{client.lastVisit}</span>
              </div>
              <div className="client-complaint-box">
                <span className="complaint-label">Recorded focus:</span>
                <p className="complaint-text">{client.primaryComplaint}</p>
              </div>
            </div>

            <div className="client-card-footer">
              <Link className="ghost-button" href="/record">
                Start Session
              </Link>
              <Link className="secondary-button" href="/rawaan-ai">
                Query with Brain ↗
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
