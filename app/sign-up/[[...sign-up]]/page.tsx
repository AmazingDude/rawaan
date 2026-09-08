import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { RawaanLogo } from "@/app/components/rawaan-logo";

export default function SignUpPage() {
  return <main className="auth-page"><Link href="/" className="auth-brand"><RawaanLogo className="rawaan-welcome-logo" /><span>rawaan</span></Link><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></main>;
}
