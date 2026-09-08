import Link from "next/link";
import { ArrowRight, CircleHelp, Play } from "lucide-react";
import styles from "./rawaan-guide.module.css";

export function RecordGuideEntry() {
  return <section aria-label="Getting started" className={styles.startCard}><Play aria-hidden="true" size={24} /><div><h2>Start here: create your first note</h2><p>Record first, add your client afterward, then review and save. We’ll show you each step.</p></div><Link className={styles.action} href="/learn-rawaan" prefetch={false}>Watch the walkthrough <ArrowRight aria-hidden="true" size={16} /></Link></section>;
}
export function RecordGuideLink() {
  return <Link className={styles.helpLink} href="/learn-rawaan" prefetch={false}><CircleHelp aria-hidden="true" size={16} /> How to use Rawaan</Link>;
}
