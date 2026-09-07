import { BrainChat } from "@/app/components/brain-chat";

export default async function RawaanAiPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;

  return (
    <div className="chatgpt-page-wrapper">
      <BrainChat initialPatientId={patient} />
    </div>
  );
}
