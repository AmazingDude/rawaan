"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock, FileText } from "lucide-react";
import { useState } from "react";
import { tutorials, formatTutorialTime } from "@/lib/guides/tutorials";
import { TutorialPlayer } from "./tutorial-player";
import { RawaanLogo } from "./rawaan-logo";
import styles from "./rawaan-guide.module.css";

export function RawaanGuide() {
  const [selectedId, setSelectedId] = useState(tutorials[0].id);
  const [time, setTime] = useState(0);
  const [seekTo, setSeekTo] = useState<{ seconds: number; request: number }>();
  const tutorial = tutorials.find(item => item.id === selectedId) ?? tutorials[0];
  const activeChapter = [...tutorial.chapters].reverse().find(chapter => chapter.startSeconds <= time);
  return (
    <div className={styles.guide}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>A little guidance goes a long way</p><h1>Make your first note.<br /><span>We’ll walk you through it.</span></h1><p>Watch the steps, follow along, and pick up exactly where you need help.</p></div>
        <RawaanLogo className={styles.mascot} />
      </header>
      <nav aria-label="Choose a walkthrough" className={styles.lessons}>
        {tutorials.map((item, index) => <button aria-pressed={item.id === tutorial.id} className={item.id === tutorial.id ? styles.lessonActive : styles.lesson} key={item.id} onClick={() => { setSelectedId(item.id); setTime(0); setSeekTo(undefined); }} type="button"><span className={styles.lessonNumber}>0{index + 1}</span><span><strong>{item.title}</strong><small><Clock aria-hidden="true" size={12} /> {formatTutorialTime(item.durationSeconds)}</small></span><ChevronRight aria-hidden="true" size={17} /></button>)}
      </nav>
      <section aria-labelledby="walkthrough-title" className={styles.walkthrough}>
        <div className={styles.watchColumn}>
          <TutorialPlayer key={`video-${tutorial.id}`} onTimeChange={setTime} seekTo={seekTo} tutorial={tutorial} />
          <div className={styles.videoDescription}><div><h2 id="walkthrough-title">{tutorial.title}</h2><p>{tutorial.description}</p></div><span>Fictional training example</span></div>
          <details className={styles.transcript} key={`transcript-${tutorial.id}`}><summary><FileText aria-hidden="true" size={16} /> Read the video transcript</summary>{tutorial.transcript.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details>
        </div>
        <aside className={styles.chapterPanel} aria-label="Video chapters">
          <p className={styles.eyebrow}>Jump to a step</p>
          <ol>{tutorial.chapters.map((chapter, index) => <li key={chapter.id}><button aria-current={activeChapter?.id === chapter.id ? "step" : undefined} className={activeChapter?.id === chapter.id ? styles.chapterActive : styles.chapter} onClick={() => { setTime(chapter.startSeconds); setSeekTo(previous => ({ seconds: chapter.startSeconds, request: (previous?.request ?? 0) + 1 })); }} type="button"><span>{String(index + 1).padStart(2, "0")}</span><strong>{chapter.title}</strong><small>{formatTutorialTime(chapter.startSeconds)}</small></button></li>)}</ol>
          <Link className={styles.action} href={tutorial.action.href} prefetch={false}>{tutorial.action.label}<ArrowRight aria-hidden="true" size={17} /></Link>
        </aside>
      </section>
      <section aria-labelledby="written-steps-title" className={styles.writtenSteps}>
        <div><p className={styles.eyebrow}>Prefer to follow along?</p><h2 id="written-steps-title">Your step-by-step checklist</h2><p>No need to remember everything in the video. Keep this beside you.</p></div>
        <ol>{tutorial.chapters.map((chapter, index) => <li id={`step-${chapter.id}`} key={chapter.id}><span className={styles.stepNumber}>{index + 1}</span><div><h3>{chapter.title}</h3><p>{chapter.instruction}</p></div></li>)}</ol>
      </section>
      <section className={styles.tips} aria-label="Common questions">
        <h2>A few things that help</h2>
        <details><summary>Do I need a client before recording?</summary><p>No. You can leave the client unassigned, record first, then select or create the client on the next screen.</p></details>
        <details><summary>What if the microphone does not work?</summary><p>Allow microphone access in your browser’s site settings, choose the correct microphone, and use Check! again. You can also use Write a summary to enter the session details as text.</p></details>
        <details><summary>When is my note saved to the client’s record?</summary><p>A generated draft needs your review. Choose Approve &amp; Save Note when it accurately reflects the session. Creating a client or generating a draft does not approve a note.</p></details>
        <details><summary>Why can’t Records only find an answer?</summary><p>Select the correct client and check that their session notes have been approved and saved. Records only searches those notes. If the information was never documented, it will say there is no relevant record.</p></details>
      </section>
      <footer className={styles.guideFooter}><span><Check aria-hidden="true" size={18} /> Record. Assign. Review. Save.</span><Link className={styles.action} href="/record" prefetch={false}>Create your first note <ArrowRight aria-hidden="true" size={17} /></Link></footer>
    </div>
  );
}
