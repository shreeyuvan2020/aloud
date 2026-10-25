"use client";

import { usePathname } from "next/navigation";
import { SignInCard } from "@/components/SignInCard";

/** Client wrapper so the sign-in card knows which teacher page to return to. */
export function SignInGate() {
  const pathname = usePathname();
  return <SignInCard next={pathname} title="Sign in to set up a session" />;
}
