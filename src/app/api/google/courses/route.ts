import { NextResponse } from "next/server";
import { googleErrorResponse, requireToken } from "@/lib/account";
import { listCourses } from "@/lib/classroom";

export async function GET() {
  try {
    return NextResponse.json({ courses: await listCourses(await requireToken()) });
  } catch (err) {
    return googleErrorResponse(err);
  }
}