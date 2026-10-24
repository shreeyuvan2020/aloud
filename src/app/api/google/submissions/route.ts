import { NextResponse } from "next/server";
import { googleErrorResponse, requireToken } from "@/lib/account";
import { listSubmissions } from "@/lib/classroom";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const courseId = p.get("courseId");
  const courseWorkId = p.get("courseWorkId");
  const ID = /^[A-Za-z0-9_-]+$/;
  if (!courseId || !courseWorkId) {
    return NextResponse.json({ error: "courseId and courseWorkId required" }, { status: 400 });
  }
  if (!ID.test(courseId) || !ID.test(courseWorkId)) {
    return NextResponse.json({ error: "Invalid courseId or courseWorkId" }, { status: 400 });
  }

  try {
    // No permission probe here — the Docs API has no metadata-only access check,
    // so probing would mean downloading every student's full essay just to build
    // the list. Failures are reported per-student at import time instead.
    const submissions = await listSubmissions(await requireToken(), courseId, courseWorkId);
    return NextResponse.json({ submissions });
  } catch (err) {
    return googleErrorResponse(err);
  }
}