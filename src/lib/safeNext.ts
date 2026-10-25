/** Only same-site paths, so a crafted ?next= can't bounce a teacher to another origin. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
