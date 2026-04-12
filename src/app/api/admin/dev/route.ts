import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/dev
 * Returns recent git commits and deployment info for the dev page.
 * Uses GITHUB_TOKEN if available, otherwise returns static info.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "fintella-ai/tariff-partner-portal";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "main";
  const deployUrl = process.env.VERCEL_URL || "";
  const deployedAt = process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN
    ? process.env.VERCEL_GIT_COMMIT_MESSAGE
    : null;

  let commits: any[] = [];
  let source = "static";

  if (token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=15`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        commits = data.map((c: any) => ({
          sha: c.sha.substring(0, 7),
          fullSha: c.sha,
          message: c.commit.message.split("\n")[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
        }));
        source = "github_api";
      }
    } catch (e) {
      console.error("GitHub API error:", e);
    }
  }

  return NextResponse.json({
    commits,
    source,
    deployment: {
      commitSha: commitSha.substring(0, 7),
      fullSha: commitSha,
      branch,
      deployUrl,
      deployedAt,
      repo,
    },
    githubTokenConfigured: !!token,
  });
}
