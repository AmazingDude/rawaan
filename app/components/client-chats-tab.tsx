"use client";

import { ChevronDown, MessageSquare, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { listChatThreadsAction } from "@/app/actions";
import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";
import type { ChatThread } from "@/lib/db/chats";

export function ClientChatsTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listChatThreadsAction(patientId).then((result) => {
      if (!cancelled) setThreads(result);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  function handleNewChat() {
    router.push(`/rawaan-ai?patient=${encodeURIComponent(patientId)}`);
  }

  return (
    <div className="client-chats-tab">
      <div className="client-chats-toolbar">
        <p className="client-chats-hint">
          Every Rawaan AI conversation for this client is saved here. Click any conversation to view it.
        </p>
        <button
          className="primary-button"
          onClick={handleNewChat}
          type="button"
        >
          <MessageSquarePlus aria-hidden="true" size={15} /> New chat
        </button>
      </div>

      {threads === null ? (
        <p className="brain-chat-loading">Loading chats…</p>
      ) : threads.length === 0 ? (
        <div className="brain-chat-empty">
          <p>
            No chats yet for this client. Start a new chat to ask questions
            grounded in their approved notes.
          </p>
        </div>
      ) : (
        <ul className="client-chat-list">
          {[...threads].reverse().map((thread) => {
            const isOpen = expandedThreadId === thread.threadId;
            const firstQuestion = thread.entries[0]?.question || "Conversation";
            const dateStr = new Date(thread.startedAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            });

            return (
              <li className="client-chat-item" key={thread.threadId}>
                <button
                  className="client-chat-summary"
                  onClick={() =>
                    setExpandedThreadId(isOpen ? null : thread.threadId)
                  }
                  type="button"
                  aria-expanded={isOpen}
                >
                  <div className="client-chat-summary-left">
                    <MessageSquare
                      aria-hidden="true"
                      className="client-chat-icon"
                      size={16}
                    />
                    <span className="client-chat-date">{dateStr}</span>
                    <span className="client-chat-preview">{firstQuestion}</span>
                  </div>

                  <div className="client-chat-summary-right">
                    <span className="client-chat-count">
                      {thread.entries.length}{" "}
                      {thread.entries.length === 1 ? "turn" : "turns"}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`client-session-chevron ${isOpen ? "is-rotated" : ""}`}
                      size={16}
                    />
                  </div>
                </button>

                {isOpen ? (
                  <div className="client-chat-detail">
                    {thread.entries.map((entry, index) => (
                      <ChatEntryCard
                        entry={entry}
                        key={`${entry.timestamp}-${index}`}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
