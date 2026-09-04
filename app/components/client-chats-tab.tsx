"use client";

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { listChatThreadsAction } from "@/app/actions";
import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";
import type { ChatThread } from "@/lib/db/chats";

export function ClientChatsTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);

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
          Every Rawaan AI conversation for this client is saved here.
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
        [...threads].reverse().map((thread) => (
          <section className="client-chat-thread" key={thread.threadId}>
            <h3 className="client-chat-thread-date">
              {new Date(thread.startedAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </h3>
            {thread.entries.map((entry, index) => (
              <ChatEntryCard entry={entry} key={`${entry.timestamp}-${index}`} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
