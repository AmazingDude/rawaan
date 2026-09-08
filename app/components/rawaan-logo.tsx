import Image from "next/image";

export function RawaanLogo({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return <Image src="/images/rawaan-mascot.png" width={1536} height={1024} className={className} alt={decorative ? "" : "Rawaan"} />;
}
