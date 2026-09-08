import { BrainChat } from "@/app/components/brain-chat";

export default async function RawaanAiPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string | string[]; question?: string | string[] }>;
}) {
  const { patient, question } = await searchParams;

  return (
    <div className="chatgpt-page-wrapper">
      <BrainChat
        initialPatientId={typeof patient === "string" ? patient : undefined}
        initialQuestion={typeof question === "string" ? question.slice(0, 500) : undefined}
      />
    </div>
  );
}
