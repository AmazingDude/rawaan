import type { Metadata } from "next";
import Link from "next/link";
import { RawaanGuide } from "@/app/components/rawaan-guide";
import { RawaanLogo } from "@/app/components/rawaan-logo";
import styles from "@/app/components/rawaan-guide.module.css";

export const metadata: Metadata = { title: "How to use Rawaan", description: "Follow the visual guide to record a session, review your first note, and find it again." };
export default function HowToUsePage() {
  return <div className={styles.publicPage}><nav aria-label="Rawaan" className={styles.publicNav}><Link className={styles.brand} href="/"><RawaanLogo decorative />rawaan</Link><div className={styles.publicLinks}><Link href="/sign-in">Sign in</Link><Link className={styles.action} href="/record" prefetch={false}>Open workspace</Link></div></nav><main><RawaanGuide /></main></div>;
}
