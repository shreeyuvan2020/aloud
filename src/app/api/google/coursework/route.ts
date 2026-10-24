import { NextResponse } from "next/server";
import { googleErrorResponse, requireToken } from "@/lib/account";
import { listCourseWork } from "@/lib/classroom";

export async function GET(req: Request) {
  const courseId = new URL(req.url).searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });
  if (!/^[A-Za-z0-9_-]+$/.test(courseId)) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }

  try {
    return NextResponse.json({ courseWork: await listCourseWork(await requireToken(), courseId) });
  } catch (err) {
    return googleErrorResponse(err);
  }
}