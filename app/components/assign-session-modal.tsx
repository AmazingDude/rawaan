"use client";

import { Sprout, X } from "lucide-react";
import { useState } from "react";

import { createClientAction, type ClientRecord } from "@/app/actions";

interface AssignSessionModalProps {
  clients: ClientRecord[];
  isOpen: boolean;
  onAssign: (client: ClientRecord) => void;
  onClose: () => void;
  onDelete: () => void;
  recordingTitle?: string;
}

export function AssignSessionModal({
  clients = [],
  isOpen,
  onAssign,
  onClose,
  onDelete,
  recordingTitle,
}: AssignSessionModalProps) {
  const [view, setView] = useState<"assign" | "create">("assign");
  const [createdClients, setCreatedClients] = useState<ClientRecord[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // New Client Form State (Picture 2)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const allClients = [...createdClients, ...clients.filter(c => !createdClients.some(cc => cc.patientId === c.patientId))];


  const defaultTitle =
    recordingTitle ||
    `Rawaan-${new Date().toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    }).replace(/\//g, ".")}`;

  const filteredClients = allClients.filter(
    (c) =>
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.mobileNumber && c.mobileNumber.includes(searchQuery)),
  );

  async function handleCreateClientSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setErrorMessage("Please enter a first name for the client.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createClientAction({
      email,
      firstName,
      lastName,
      mobileNumber,
    });

    setIsSubmitting(false);

    if (res.ok) {
      setCreatedClients((prev) => [res.client, ...prev]);
      setSelectedClient(res.client);
      setFirstName("");
      setLastName("");
      setEmail("");
      setMobileNumber("");
      setView("assign");
    } else {
      setErrorMessage(res.message);
    }
  }

  function handleNext() {
    if (selectedClient) {
      onAssign(selectedClient);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="assign-session-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "create" ? (
          /* ===================================================================
             PICTURE 2: CREATE A NEW CLIENT VIEW
             =================================================================== */
          <div className="create-client-view">
            <header className="create-client-header">
              <button
                aria-label="Back to assign session"
                className="btn-back-arrow"
                onClick={() => setView("assign")}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="18"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                  viewBox="0 0 24 24"
                  width="18"
                >
                  <line x1="19" x2="5" y1="12" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <h2>Create A New Client</h2>
            </header>

            {errorMessage ? (
              <div className="modal-alert-banner" role="alert">
                {errorMessage}
              </div>
            ) : null}

            <form className="create-client-form" onSubmit={handleCreateClientSubmit}>
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  autoFocus
                  className="form-input-box"
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Client First Name"
                  required
                  type="text"
                  value={firstName}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  className="form-input-box"
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Client Last Name"
                  type="text"
                  value={lastName}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <div className="input-with-icon-wrap">
                  <span className="input-inner-icon">
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="16"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                  <input
                    className="form-input-box with-icon"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Client Email"
                    type="email"
                    value={email}
                  />
                </div>
              </div>

              {/* Pronouns replaced with Client Mobile Number as requested */}
              <div className="form-group">
                <label className="form-label">Client Mobile Number (Optional)</label>
                <input
                  className="form-input-box"
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="Client Mobile Number (e.g. +92 300 1234567)"
                  type="tel"
                  value={mobileNumber}
                />
              </div>

              <button
                className="primary-button btn-create-client-submit"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Creating…" : "Create New Client"}
              </button>
            </form>
          </div>
        ) : (
          /* ===================================================================
             PICTURE 1: ASSIGN SESSION MODAL
             =================================================================== */
          <div className="assign-session-view">
            {/* Modal Header */}
            <header className="modal-header-simple">
              <div className="header-lockup">
                <span className="plant-sprout-icon" aria-hidden="true">
                  <Sprout size={18} />
                </span>
                <h2>Assign Session</h2>
              </div>
              <button
                aria-label="Close"
                className="btn-close-modal"
                onClick={onClose}
                type="button"
              >
                <X size={16} />
              </button>
            </header>

            {/* Recording badge card */}
            <div className="recording-badge-card">
              <div className="badge-card-left">
                <div className="badge-wave-icon-box">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    stroke="#10b981"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                    viewBox="0 0 24 24"
                    width="20"
                  >
                    <path d="M2 10v3" />
                    <path d="M6 6v11" />
                    <path d="M10 3v18" />
                    <path d="M14 8v7" />
                    <path d="M18 5v13" />
                    <path d="M22 10v3" />
                  </svg>
                </div>
                <div className="badge-text-meta">
                  <h3 className="badge-title">{defaultTitle}</h3>
                  <p className="badge-subtitle">In-Person Recording</p>
                </div>
              </div>
              <div className="badge-card-right">
                <span className="checkmark-circle-icon" aria-label="Completed">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="18"
                    stroke="#10b981"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                    width="18"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Assign Section Header */}
            <div className="assign-section-row">
              <span className="assign-section-label">Assign to Client or Group</span>
              <button
                className="btn-create-new-client-link"
                onClick={() => setView("create")}
                type="button"
              >
                + Create New
              </button>
            </div>

            {/* Searchable Client Dropdown */}
            <div className="client-search-field-container">
              <div
                className={`client-search-pill-box ${isDropdownOpen ? "is-open" : ""}`}
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                role="button"
                tabIndex={0}
              >
                <svg
                  aria-hidden="true"
                  className="search-field-icon"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" x2="16.65" y1="21" y2="16.65" />
                </svg>
                <span className="search-field-text">
                  {selectedClient ? selectedClient.displayName : "Search for your client"}
                </span>
                <span className="search-field-caret">⌄</span>
              </div>

              {isDropdownOpen ? (
                <div className="client-search-results-menu">
                  <div className="dropdown-search-box">
                    <input
                      autoFocus
                      className="dropdown-input"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Type client name, email or phone…"
                      type="text"
                      value={searchQuery}
                    />
                  </div>

                  <ul className="results-list">
                    {filteredClients.map((client) => (
                      <li
                        key={client.patientId}
                        className={`result-item ${selectedClient?.patientId === client.patientId ? "is-active" : ""}`}
                        onClick={() => {
                          setSelectedClient(client);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="result-name">{client.displayName}</div>
                        {client.mobileNumber || client.email ? (
                          <div className="result-meta">
                            {client.mobileNumber} {client.email ? `• ${client.email}` : ""}
                          </div>
                        ) : null}
                      </li>
                    ))}

                    {filteredClients.length === 0 ? (
                      <li className="result-empty-state">
                        <p>No client found matching &quot;{searchQuery}&quot;</p>
                        <button
                          className="btn-create-inline-prompt"
                          onClick={() => {
                            setFirstName(searchQuery);
                            setView("create");
                          }}
                          type="button"
                        >
                          + Create client &quot;{searchQuery}&quot;
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Bottom Actions Bar matching Picture 1 */}
            <footer className="assign-modal-footer">
              <button
                className="btn-delete-recording"
                onClick={onDelete}
                type="button"
              >
                Delete Recording
              </button>
              <button
                className="btn-next-step"
                disabled={!selectedClient}
                onClick={handleNext}
                type="button"
              >
                Next
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
