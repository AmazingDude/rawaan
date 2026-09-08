import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { registerUser } from "@/lib/auth/register-user";

const isPublicRoute = createRouteMatcher(["/", "/how-to-use", "/tutorials/(.*)", "/sign-in(.*)", "/sign-up(.*)", "/api/health"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    const session = await auth.protect();
    await registerUser(session.userId);
  }
}, { jwtKey: process.env.CLERK_JWT_KEY, signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
