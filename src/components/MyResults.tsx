import Link from "next/link";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/session";

/** Home-page list of the signed-in teacher's results pages. */
export async function MyResults() {
  const teacher = await getTeacher();

  const assignments = teacher
    ? await prisma.assignment.findMany({
        where: { ownerId: teacher.id },
        select: { teacherToken: true, title: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  // One results page per token: a Classroom import puts a whole class on one.
  const groups = new Map<string, { title: string; count: number }>();
  for (const a of assignments) {
    const g = groups.get(a.teacherToken);
    if (g) g.count += 1;
    else groups.set(a.teacherToken, { title: a.title, count: 1 });
  }

  return (
    <section id="your-results" style={{ marginTop: 44 }}>
      <h2>Your results</h2>
      <div className="card">
        {!teacher ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Sign in with Google to see the sessions you&rsquo;ve set up and your students&rsquo;
              scores. Results belong to your account, so they&rsquo;re there from any device.
            </p>
            <a href="/api/auth/login?next=/%23your-results">
              <button>Sign in with Google</button>
            </a>
          </>
        ) : groups.size === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing yet. Set up a session and its results will be listed here.
          </p>
        ) : (
          [...groups.entries()].map(([token, g], i) => (
            <div
              key={token}
              className="row spread"
              style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
            >
              <strong style={{ fontWeight: 600 }}>
                {g.title}
                {g.count > 1 && <span className="muted"> &middot; {g.count} essays</span>}
              </strong>
              <Link href={`/t/${token}`}>
                <button className="ghost sm">See scores</button>
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
