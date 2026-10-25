import Link from "next/link";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/session";

/**
 * Sessions assigned to the signed-in person, matched by Google account id
 * (Classroom imports) or email (pasted essays). Only the student link is
 * selected here, never the teacher's results token.
 */
export async function AssignedToMe() {
  const me = await getTeacher();

  const email = me?.email.trim().toLowerCase();
  const assignments = me
    ? await prisma.assignment.findMany({
        where: {
          OR: [
            { studentGoogleId: me.googleUserId },
            ...(email ? [{ studentEmail: email }] : []),
          ],
        },
        select: { id: true, title: true, studentToken: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  const done = new Set(
    me && assignments.length
      ? (
          await prisma.session.findMany({
            where: {
              studentAccountId: me.id,
              status: "complete",
              assignmentId: { in: assignments.map((a) => a.id) },
            },
            select: { assignmentId: true },
          })
        ).map((s) => s.assignmentId)
      : [],
  );

  return (
    <section id="assigned" style={{ marginTop: 44 }}>
      <h2>For students</h2>
      <div className="card">
        {!me ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Students: sign in with the Google account your teacher uses for you and your
              assignments will be listed here &mdash; no link needed.
            </p>
            <a href="/api/auth/login?next=/%23assigned">
              <button>Sign in with Google</button>
            </a>
          </>
        ) : assignments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing assigned to {me.email} yet. If your teacher gave you a link, open that instead.
          </p>
        ) : (
          assignments.map((a, i) => (
            <div
              key={a.id}
              className="row spread"
              style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
            >
              <strong style={{ fontWeight: 600 }}>
                {a.title}
                {done.has(a.id) && <span className="muted"> &middot; Done</span>}
              </strong>
              <Link href={`/s/${a.studentToken}`}>
                <button className={done.has(a.id) ? "ghost sm" : "sm"}>
                  {done.has(a.id) ? "Do it again" : "Start"}
                </button>
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
