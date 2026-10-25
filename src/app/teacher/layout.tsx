import { SignInGate } from "@/components/SignInGate";
import { getTeacher } from "@/lib/session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacher = await getTeacher();
  if (!teacher) return <SignInGate />;
  return children;
}
