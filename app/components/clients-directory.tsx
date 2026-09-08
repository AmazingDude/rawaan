"use client";

import { Search, Video } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { ClientRecord } from "@/app/actions";
import styles from "@/app/components/clients-directory.module.css";
import { ImportClientButton } from "@/app/components/client-sharing";

type ClientFilter = "all" | "with-sessions" | "without-sessions";

function formatDate(date: string | null): string {
  if (!date) return "Not recorded";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ClientsDirectory({ clients }: { clients: ClientRecord[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const visibleClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return clients.filter((client) => {
      const matchesName = !normalizedQuery || client.displayName.toLocaleLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === "all"
        || (filter === "with-sessions" && client.noteCount > 0)
        || (filter === "without-sessions" && client.noteCount === 0);
      return matchesName && matchesFilter;
    });
  }, [clients, filter, query]);

  return (
    <main className={styles.directory}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your workspace</p>
          <h1>Clients</h1>
          <p className={styles.subtitle}>Keep each client&apos;s recorded sessions and notes together.</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><ImportClientButton/><Link className="primary-button" href="/record"><Video aria-hidden="true" size={16} /> Record a session</Link></div>
      </header>

      <section className={styles.listCard} aria-label="Client directory">
        <div className={styles.controls}>
          <label className={styles.search}>
            <Search aria-hidden="true" size={17} />
            <span className={styles.srOnly}>Search clients</span>
            <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search clients" value={query} />
          </label>
          <div className={styles.filters} aria-label="Filter clients" role="group">
            {([
              ["all", "All clients"],
              ["with-sessions", "With recorded sessions"],
              ["without-sessions", "No recorded sessions"],
            ] as const).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                className={filter === value ? styles.filterActive : styles.filter}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >{label}</button>
            ))}
          </div>
        </div>

        {clients.length === 0 ? (
          <div className={styles.empty}>
            <h2>No clients yet</h2>
            <p>Start a session and add a client to build their record.</p>
            <Link className="primary-button" href="/record">Record a session</Link>
          </div>
        ) : visibleClients.length === 0 ? (
          <p className={styles.noResults} role="status">No clients match your search and filter.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">Client</th><th scope="col">Sessions</th><th scope="col">First session</th><th scope="col">Last session</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr>
              </thead>
              <tbody>
                {visibleClients.map((client) => {
                  const clientHref = `/clients/${encodeURIComponent(client.patientId)}`;
                  const sessionHref = `/record?patient=${encodeURIComponent(client.patientId)}`;
                  return (
                    <tr key={client.patientId}>
                      <th className={styles.clientCell} data-label="Client" scope="row"><Link href={clientHref}>{client.displayName}</Link></th>
                      <td data-label="Sessions">{client.noteCount}</td>
                      <td data-label="First session">{formatDate(client.firstSessionDate)}</td>
                      <td data-label="Last session">{formatDate(client.lastSessionDate)}</td>
                      <td className={styles.actions} data-label="Actions"><Link href={clientHref}>Open client</Link><Link href={sessionHref}>Record session</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
