import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { RawaanLogo } from "@/app/components/rawaan-logo";

export default function SignInPage() {
  return <main className="auth-page"><Link href="/" className="auth-brand"><RawaanLogo className="rawaan-welcome-logo" /><span>rawaan</span></Link><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /></main>;
}
