import { TutorialPreview } from "./tutorial-preview";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, FileText, Mic, Search } from "lucide-react";
import styles from "./landing-page.module.css";
import { Show, UserButton } from "@clerk/nextjs";

const prompts = ["What symptoms were documented?", "What plan was discussed?", "What follow-up was recorded?", "Show the patient's history"];
const questions = [
  ["How does a conversation become a note?", "Record, dictate, or type a consultation. Rawaan creates a structured draft that you can edit field by field. You review and approve it before it becomes part of the patient's record."],
  ["Can I use Urdu and English?", "Rawaan supports Urdu, English, and conversations that move between both. Review the transcript and draft for names, clinical terms, and meaning before approval."],
  ["Where do the Brain's answers come from?", "The Brain searches the selected patient's approved notes and shows matching passages with their source notes. If it cannot find a relevant record, it says so. You decide how the retrieved passages apply to your question."],
  ["Can Rawaan help with clinical planning?", "Rawaan can explore possible diagnoses, discuss medication considerations, and draft treatment plans for clinician review. You review the context, references, and proposed plan before saving."],
  ["How do I access my workspace?", "Create an account or sign in with Clerk. Your patients, approved notes, and chat history belong to your account and are kept separate from other users' records."],
];

function Mascot({ className, eager = false }: { className?: string; eager?: boolean }) {
  return <Image src="/images/rawaan-mascot.png" width={1536} height={1024} alt="Rawaan watermelon mascot" className={className} loading={eager ? "eager" : "lazy"} />;
}

function Waveform() {
  return <div className={styles.waveform} aria-hidden="true">{Array.from({ length: 35 }, (_, i) => <i key={i} style={{ height: `${16 + ((i * 17) % 43)}px` }} />)}</div>;
}

function NoteIllustration() {
  return <div className={styles.note} aria-label="Illustration of Rawaan's reviewable note fields">
    <div className={styles.noteToolbar}><span><FileText size={15} /> Consultation note</span><small>For your review</small></div>
    <h3>A clear record.<br />In your words.</h3>
    {["Chief complaint", "History / symptoms", "Assessment discussed", "Plan / next steps"].map(label => <div className={styles.noteField} key={label}><span>{label}</span><div aria-hidden="true"><i /><i /></div></div>)}
    <p className={styles.noteApproval}><Check size={16} /> Reviewed by you. Approved by you.</p>
  </div>;
}

export function LandingPage() {
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="Rawaan navigation">
      <Link href="/" className={styles.brand} aria-label="Rawaan home"><Mascot className={styles.brandMascot} eager /><span>rawaan</span></Link>
      <div className={styles.navLinks}><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a><a href="#questions">FAQs</a></div>
      <Show when="signed-out"><Link href="/sign-in" className={styles.workspaceLink}>Sign in</Link></Show>
      <Show when="signed-in"><UserButton /></Show>
      <Link href="/record" className={styles.button}>Try Rawaan <ArrowRight size={17} /></Link>
      <details className={styles.mobileMenu}><summary>Menu</summary><div><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a><a href="#questions">FAQs</a></div></details>
    </nav>

    <section className={styles.hero} aria-labelledby="landing-title">
      <h1 id="landing-title">Care in the moment.<br />Context for the next.</h1>
      <p>Rawaan helps doctors and therapists capture the conversation,<br className={styles.desktopBreak} /> organise your notes, and bring past visits back into view.<br /><strong>So you can focus on the person in front of you.</strong></p>
      <Link href="/record" className={styles.button}>Try Rawaan <ArrowRight size={18} /></Link>
      <small>Your account. Your patient workspace.</small>
    </section>

    <section className={styles.showcase} aria-label="From conversation to a reviewed note">
      <div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><span>rawaan / your clinical workspace</span><span>Capture → Review → Recall</span></div>
      <div className={styles.showcaseBody}><div className={styles.capturePanel}><span className={styles.eyebrow}>THE CLINICAL SCRIBE</span><Mascot className={styles.showcaseMascot} /><h2>Start with a<br />conversation.</h2><Waveform /><p><Mic size={17} /> Record, dictate, or type.</p></div><NoteIllustration /></div>
      <div className={styles.showcaseFooter}><span>Nothing becomes an approved note until you review it.</span><Link href="/record">Explore the workspace <ArrowRight size={18} /></Link></div>
    </section>
    <div className={styles.highlights}><span><Check size={16} /> Urdu + English</span><span><Check size={16} /> Clinician-reviewed notes</span><span><Check size={16} /> Recall with source notes</span></div>

    <section className={styles.assistant} aria-labelledby="assistant-title">
      <div className={styles.sectionHeading}><h2 id="assistant-title">Meet Rawaan AI.</h2><p>A little less searching. A little more context.</p></div>
      <div className={styles.assistantCard}>
        <Mascot className={styles.assistantMascot} /><h3>Hi there, what would you like to recall?</h3>
        <form action="/rawaan-ai" method="get" className={styles.questionForm}><label htmlFor="landing-question" className={styles.srOnly}>Question about a patient&apos;s documented history</label><input id="landing-question" name="question" required maxLength={500} placeholder="Ask about a patient's documented history…" autoComplete="off" /><button type="submit" aria-label="Open your question in Rawaan Brain"><ArrowRight size={26} /></button></form>
        <div className={styles.prompts}>{prompts.map(prompt => <Link key={prompt} href={`/rawaan-ai?question=${encodeURIComponent(prompt)}`}>{prompt}</Link>)}</div>
        <div className={styles.tryMe} aria-hidden="true"><svg width="140" height="75" viewBox="0 0 140 75"><path d="M135 67C84 69 36 35 15 10M15 10l2 26M15 10l23 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Try me!</span></div>
        <p className={styles.assistantHint}>Choose a patient in the workspace to search their approved notes.</p>
      </div>
    </section>

    <section className={styles.features} id="features" aria-labelledby="features-title">
      <div className={styles.sectionHeading}><h2 id="features-title">Made for the conversation.<br />Built for what comes next.</h2><p>Capture the visit. Review the note. Carry the context forward.</p></div>
      <div className={styles.featureRow}>
        <div className={`${styles.featureVisual} ${styles.sage}`}><span className={styles.eyebrow}>LESS TYPING. MORE LISTENING.</span><div className={styles.micCircle}><Mic size={48} strokeWidth={1.5} /></div><Waveform /><div className={styles.languagePills}><span>English</span><span lang="ur" dir="rtl">اردو</span><span>Or a little of both.</span></div></div>
        <div className={styles.featureCopy}><span className={styles.eyebrow}>01 / CAPTURE</span><h3>Just talk.<br />Rawaan takes notes.</h3><p>Bring a consultation into the workspace as audio or text. Rawaan turns the transcript into a structured draft, keeping the original conversation attached for review.</p><Link href="/record">Start a consultation <ArrowRight size={18} /></Link></div>
      </div>
      <div className={`${styles.featureRow} ${styles.reverse}`}>
        <div className={styles.featureCopy}><span className={styles.eyebrow}>02 / RECALL</span><h3>Their history.<br />Back in view.</h3><p>Ask about a patient&apos;s past visits. The Brain finds matching passages in their approved notes and brings the sources with them. No relevant record? It says so.</p><Link href="/rawaan-ai">Meet the patient Brain <ArrowRight size={18} /></Link></div>
        <div className={`${styles.featureVisual} ${styles.teal}`}><Search size={36} strokeWidth={1.5} /><h3>A question today.<br />A record from before.</h3><div className={styles.recallQuestion}>What was discussed last time?</div><div className={styles.excerpt}><span>Passages from approved notes</span><div aria-hidden="true"><i /><i /><i /></div><small><FileText size={13} /> Source note · consultation date</small></div></div>
      </div>
      <div className={styles.featureRow}>
        <div className={`${styles.featureVisual} ${styles.peach}`}><NoteIllustration /></div>
        <div className={styles.featureCopy}><span className={styles.eyebrow}>03 / REVIEW</span><h3>A helpful first draft.<br />The final word is yours.</h3><p>Read the transcript. Edit each field. Approve the note when it reflects the consultation. Your patient records stay organised, with clinician approval at the centre.</p><Link href="/clients">Explore patient records <ArrowRight size={18} /></Link></div>
      </div>
    </section>

    <section id="how-it-works" className={styles.workflow} aria-labelledby="workflow-title"><div className={styles.sectionHeading}><h2 id="workflow-title">One visit. Three simple steps.</h2></div><ol>{[
      ["Capture the conversation", "Record audio, dictate, or enter a transcript in Urdu or English."],
      ["Make the note yours", "Review the draft beside its transcript. Edit, then explicitly approve."],
      ["Carry the context forward", "Find the note in the patient's record and retrieve it when they return."],
    ].map(([title, copy], i) => <li key={title}><span className={styles.stepNumber}>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol><TutorialPreview /></section>

    <section id="about" className={styles.about} aria-labelledby="about-title"><Mascot className={styles.aboutMascot} /><div><span className={styles.eyebrow}>A CLINICAL SCRIBE + PATIENT BRAIN</span><h2 id="about-title">The visit ends.<br />The context shouldn&apos;t.</h2><p>Built around the way consultations happen: conversation first, documentation second, and a record you can return to.</p><p>Rawaan brings Urdu and English note capture together with source-backed recall. You stay in control of every approved note.</p><Link href="/how-to-use">Get to know Rawaan <ArrowRight size={18} /></Link><small>Documentation, record recall, and clinical planning with clinician review.</small></div></section>

    <section id="questions" className={styles.faq} aria-labelledby="questions-title"><div><span className={styles.eyebrow}>A FEW THINGS YOU MIGHT WONDER</span><h2 id="questions-title">Good questions.<br />Clear answers.</h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

    <section className={styles.finalCta}><h2>A little less paperwork.<br />A little more presence.</h2><p>Turn each consultation into a record you can return to.</p><Link href="/record" className={styles.button}>Try Rawaan <ArrowRight size={18} /></Link></section>
    <footer className={styles.footer}><div><Link href="/" className={styles.brand}><Mascot className={styles.brandMascot} /><span>rawaan</span></Link><p>Clinical Scribe + Patient Brain</p></div><div className={styles.footerLinks}><a href="#features">Features</a><Link href="/how-to-use">The Rawaan guide</Link><Link href="/record">Open workspace</Link></div><small>Documentation and recall, with clinical judgment left to you.</small></footer>
  </main>;
}
