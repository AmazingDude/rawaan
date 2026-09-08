"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type SessionTab = "notes" | "client" | "treatment" | "transcript" | "session-info" | "mindmap" | "reflection";

const tabs: { id: SessionTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "client", label: "Client" },
  { id: "treatment", label: "Treatment Plan" },
  { id: "transcript", label: "Transcript" },
  { id: "session-info", label: "Session Information" },
  { id: "mindmap", label: "Mindmap" },
  { id: "reflection", label: "Reflection Questions" },
];

export function SessionTabs({ activeTab, onChange }: { activeTab: SessionTab; onChange: (tab: SessionTab) => void }) {
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<SessionTab, HTMLButtonElement>());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const updateOverflow = () => {
      setCanScrollLeft(nav.scrollLeft > 0);
      setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    };
    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(nav);
    nav.addEventListener("scroll", updateOverflow, { passive: true });
    return () => {
      resizeObserver.disconnect();
      nav.removeEventListener("scroll", updateOverflow);
    };
  }, []);

  useEffect(() => {
    tabRefs.current.get(activeTab)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  function focusTab(tab: SessionTab) {
    onChange(tab);
    tabRefs.current.get(tab)?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    focusTab(tabs[nextIndex].id);
  }

  function scrollBy(direction: -1 | 1) {
    navRef.current?.scrollBy({ left: direction * Math.max(180, navRef.current.clientWidth * 0.65), behavior: "smooth" });
  }

  return (
    <div className="session-tab-strip">
      <button aria-label="Scroll tabs left" className="session-tab-scroll" disabled={!canScrollLeft} onClick={() => scrollBy(-1)} type="button"><ChevronLeft aria-hidden="true" size={16} /></button>
      <nav aria-label="Session document tabs" className="workspace-tabs-nav" ref={navRef} role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls="session-tab-panel"
            aria-selected={activeTab === tab.id}
            className={`workspace-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
            id={`session-tab-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id); }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >{tab.label}</button>
        ))}
      </nav>
      <button aria-label="Scroll tabs right" className="session-tab-scroll" disabled={!canScrollRight} onClick={() => scrollBy(1)} type="button"><ChevronRight aria-hidden="true" size={16} /></button>
    </div>
  );
}
