"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ByokSettings } from "@/app/components/byok-settings";

interface NavItem {
  href: string;
  icon: (active: boolean) => React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  {
    href: "/record",
    label: "Record",
    icon: (active) => (
      <svg
        aria-hidden="true"
        className={`sidebar-nav-icon accent-record ${active ? "is-active" : ""}`}
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="20"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" fill={active ? "currentColor" : "none"} r="4" />
      </svg>
    ),
  },
  {
    href: "/clients",
    label: "Clients",
    icon: (active) => (
      <svg
        aria-hidden="true"
        className={`sidebar-nav-icon accent-clients ${active ? "is-active" : ""}`}
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/rawaan-ai",
    label: "Rawaan AI",
    icon: (active) => (
      <svg
        aria-hidden="true"
        className={`sidebar-nav-icon accent-ai ${active ? "is-active" : ""}`}
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" fill={active ? "currentColor" : "none"} />
      </svg>
    ),
  },
  {
    href: "/learn-rawaan",
    label: "Learn Rawaan",
    icon: (active) => (
      <svg
        aria-hidden="true"
        className={`sidebar-nav-icon accent-learn ${active ? "is-active" : ""}`}
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
];

export function WorkspaceSidebar() {
  const pathname = usePathname();

  return (
    <aside className="workspace-sidebar" aria-label="Main navigation">
      <div className="sidebar-clinic-header">
        <div className="clinic-profile-button">
          <span className="clinic-avatar">A</span>
          <span className="clinic-name">Aashir&apos;s Clinic</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <ul className="sidebar-nav-list">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/record" && pathname === "/scribe");

            return (
              <li key={item.href} className="sidebar-nav-item">
                <Link
                  className={`sidebar-nav-link ${isActive ? "is-active" : ""}`}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => {
                    if (event.detail > 0) event.currentTarget.blur();
                  }}
                >
                  {item.icon(isActive)}
                  <span className="sidebar-nav-label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <ByokSettings />
    </aside>
  );
}
