import mediaTiming from "./media-timing.json";

export interface TutorialChapter {
  id: string;
  title: string;
  startSeconds: number;
  instruction: string;
}
export interface Tutorial {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  video: string;
  poster: string;
  captions: string;
  transcript: string[];
  chapters: TutorialChapter[];
  action: { label: string; href: string };
}
const media = (id: string) => ({ video: `/tutorials/${id}.mp4`, poster: `/tutorials/${id}.jpg`, captions: `/tutorials/${id}.vtt` });
function withMeasuredTiming(tutorial: Tutorial): Tutorial {
  const measured = (mediaTiming as Record<string, { durationSeconds: number; chapters: Record<string, number> }>)[tutorial.id];
  if (!measured) return tutorial;
  return { ...tutorial, durationSeconds: measured.durationSeconds, chapters: tutorial.chapters.map(chapter => ({ ...chapter, startSeconds: measured.chapters[chapter.id] ?? chapter.startSeconds })) };
}
export const tutorials: Tutorial[] = [
  {
    id: "first-session", title: "Your first session", description: "From a conversation to a note you can return to.", durationSeconds: 132,
    ...media("first-session"), action: { label: "Open Record", href: "/record" },
    chapters: [
      { id: "start", title: "Start in Record", startSeconds: 0, instruction: "Open Record and choose Record in-person. If you prefer to type your notes, choose Write a summary instead." },
      { id: "microphone", title: "Check your microphone", startSeconds: 18, instruction: "Choose your microphone and press Check! Allow microphone access if your browser asks. Selecting an existing client now is optional." },
      { id: "record", title: "Record, then stop", startSeconds: 35, instruction: "Press Start recording when everyone is ready. When the conversation ends, press Stop recording. Keep the page open while Rawaan transcribes." },
      { id: "assign", title: "Assign or create the client", startSeconds: 61, instruction: "After recording, select an existing client or use + Create New. Complete the client details, select the client, and press Next. If you selected a client before recording, this step is skipped." },
      { id: "review", title: "Review the transcript and draft", startSeconds: 82, instruction: "Read the Notes and Transcript tabs. Check names, clinical terms, and meaning. Use Edit note to correct the draft before approving it." },
      { id: "save", title: "Approve and find it again", startSeconds: 106, instruction: "Choose Approve & Save Note once the note reflects the session. Find it later under Clients, select the client, and open Sessions. Approved notes are read-only." },
    ],
    transcript: [
      "Welcome to Rawaan. Start in Record. This is where a conversation becomes a note you can review. Choose Record in-person for session audio. Already have written notes? Choose Write a summary. You do not need to create a client before recording.",
      "Choose the microphone you want to use, then press Check. Allow microphone access if your browser asks. You can select an existing client now, or leave the client unassigned and add them after recording.",
      "Make sure everyone is ready and has agreed to the recording. Press Start recording, and focus on the conversation. When you are finished, press Stop recording. Rawaan transcribes the audio after you stop. Keep the page open while it works. The recording shown here uses a fictional training conversation.",
      "If you did not select a client earlier, Assign Session opens next. Choose an existing client, or press Create New and complete their details. Select the client and press Next. Rawaan now creates a draft from the transcript. Creating a client alone does not approve the note.",
      "Check the draft against the original conversation. Open Transcript to review the words captured, especially names and clinical terms. Return to Notes and choose Edit note to correct anything that needs changing. The draft is yours to review; approval should wait until it accurately reflects the session.",
      "When you are satisfied, choose Approve and Save Note. The approved note becomes part of that client's record. To return to it, open Clients, choose the client, and open Sessions. Approved notes are read-only. That is the complete flow: record, assign, review, and save.",
    ],
  },
  {
    id: "past-sessions", title: "Find a past session", description: "Pick up where the last conversation left off.", durationSeconds: 52,
    ...media("past-sessions"), action: { label: "Open Clients", href: "/clients" },
    chapters: [
      { id: "find", title: "Find your client", startSeconds: 0, instruction: "Open Clients and search by name. Select the client to open their record." },
      { id: "sessions", title: "Open a saved session", startSeconds: 15, instruction: "Choose Sessions, find the consultation date, and open the saved note." },
      { id: "explore", title: "Explore the session", startSeconds: 31, instruction: "Use Notes, Transcript, and Session Information to review the session. Treatment Plan also shows separately reviewed plans; additional tabs help explore the recorded content." },
    ],
    transcript: [
      "You do not have to search through loose notes before a follow-up. Open Clients and search for the client's name. Select the client to open their individual record. Your records belong to your account.",
      "Choose Sessions to see their approved notes. Find the consultation date you need, then open the session. The note stays connected to its original transcript, so you can check what was actually recorded.",
      "Move between Notes, Transcript, and Session Information. You can also explore the other session tabs. Treatment Plan includes recorded next steps and separately reviewed plans. Return to Clients whenever you need another session. If nothing is listed yet, approve and save a note first.",
    ],
  },
  {
    id: "rawaan-ai", title: "Ask Rawaan AI", description: "Know when to ask the assistant and when to search the record.", durationSeconds: 96,
    ...media("rawaan-ai"), action: { label: "Open Rawaan AI", href: "/rawaan-ai" },
    chapters: [
      { id: "general", title: "Ask a general question", startSeconds: 0, instruction: "Open Rawaan AI and type a question. General conversations do not need a selected client." },
      { id: "records", title: "Search approved notes", startSeconds: 22, instruction: "Select a client and switch to Records only. Ask what was documented, then open the dated source note to check the passage." },
      { id: "assistant", title: "Explore with the assistant", startSeconds: 46, instruction: "Assistant mode includes the selected client's saved session history automatically. Ask your question immediately; Clinical context is optional extra information. Web search is optional and depends on availability." },
      { id: "plan", title: "Review a proposed plan", startSeconds: 70, instruction: "For a proposed plan, choose Review and save plan. Read the references, edit the content, then Confirm review and save. Find saved plans in Treatment Plan." },
    ],
    transcript: [
      "Open Rawaan AI whenever you need help with a question. In Assistant mode, you can start a general conversation without selecting a client. Type your question and send it. Earlier conversations are available in Chat history. Select a client only when you want their records included.",
      "For questions about what actually happened in a session, select the client and switch to Records only. Ask what was documented. Rawaan shows matching passages from approved notes, with dated source links. Open the source to check the context. If there is no relevant record, it says so.",
      "Switch back to Assistant for explanations and clinical considerations. Suggestions are different from recorded facts. Confirm current clinical context when Rawaan asks for it. Web search can bring in references when available. Check the references and use your own clinical judgment; generated content does not change a saved session note.",
      "A proposed treatment plan is a draft for clinician review. Choose Review and save plan, read the references, and edit the content. Use Confirm review and save only after that review. The saved plan appears in Treatment Plan separately from the original session note. You remain in control of what enters the record.",
    ],
  },
].map(withMeasuredTiming);
export const overview: Tutorial = withMeasuredTiming({
  id: "overview", title: "See how Rawaan works", description: "A conversation. A reviewed note. A record you can return to.", durationSeconds: 25,
  ...media("overview"), action: { label: "Follow the full walkthrough", href: "/how-to-use" }, chapters: [],
  transcript: ["Welcome to Rawaan. Start in Record. You do not need to create a client before recording. Check the draft against the original conversation. When you are satisfied, choose Approve and Save Note. The approved note becomes part of that client's record."],
});
export function formatTutorialTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
