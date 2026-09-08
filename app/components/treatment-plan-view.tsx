import { ClipboardList } from "lucide-react";
import Link from "next/link";

import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";
import { projectTreatmentPlan } from "@/lib/notes/treatment-plan";
import styles from "@/app/components/treatment-plan-view.module.css";

export function TreatmentPlanView({
  note,
  sourceHref,
  onEdit,
}: {
  note: NoteDraft | ApprovedNote;
  sourceHref?: string;
  onEdit?: () => void;
}) {
  const plan = projectTreatmentPlan(note);

  if (!plan.hasRecordedPlan) {
    return (
      <div className={styles.empty} role="status">
        <ClipboardList aria-hidden="true" size={28} />
        <h3>No plan recorded</h3>
        <p>This session has no documented next steps.</p>
        {onEdit ? <button className="secondary-button" onClick={onEdit} type="button">Edit discussed plan</button> : null}
      </div>
    );
  }

  return (
    <div className={styles.document}>
      <div className={styles.sourceRow}>
        <span className={styles.sourceChip}>Recorded in this session · {plan.consultationDate}</span>
        {sourceHref ? <Link className={styles.sourceLink} href={sourceHref}>View source note</Link> : null}
        {onEdit ? <button className="secondary-button" onClick={onEdit} type="button">Edit discussed plan</button> : null}
      </div>
      <div className={styles.fields}>
        {plan.fields.map((field) => (
          <section className={styles.field} key={field.label}>
            <h3>{field.label}</h3>
            {field.values.length > 0 ? (
              <ul>{field.values.map((value, index) => <li key={`${field.label}-${index}`}>{value}</li>)}</ul>
            ) : <p>Not documented</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
