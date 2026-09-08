import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { overview } from "@/lib/guides/tutorials";
import { TutorialPlayer } from "./tutorial-player";
import styles from "./rawaan-guide.module.css";

export function TutorialPreview() {
  return <div className={styles.preview}><TutorialPlayer tutorial={overview} /><p>A 25-second look at the flow. English narration and captions. Fictional training example.</p><Link href="/how-to-use">Follow the step-by-step guide <ArrowRight aria-hidden="true" size={16} /></Link><details className={styles.transcript}><summary>Read the overview transcript</summary>{overview.transcript.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</details></div>;
}
