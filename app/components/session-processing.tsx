import { Loader2 } from "lucide-react";
import { RawaanLogo } from "@/app/components/rawaan-logo";
import styles from "./session-processing.module.css";

const stages = {
  transcribing: {
    title: "Giving your keyboard a breather...",
    detail: "Rawaan is turning your conversation into text.",
  },
  generating: {
    title: "Putting your note together...",
    detail: "A little structure. A lot less typing. You'll review it before saving.",
  },
  opening: {
    title: "Pulling up your review desk...",
    detail: "Almost there. You get the final say.",
  },
};

export function SessionProcessing({ stage }: { stage: keyof typeof stages }) {
  const copy = stages[stage];
  return (
    <section className={styles.surface} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.card}>
        <RawaanLogo className={styles.mascot} decorative />
        <h2>{copy.title}</h2>
        <p>{copy.detail}</p>
        <Loader2 className={styles.spinner} aria-hidden="true" size={24} />
        <div className={styles.preview} aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </section>
  );
}
