import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

/**
 * Google sign-in is **partner-only** and strictly a convenience shortcut for
 * already-invited partners. We do NOT auto-provision new partners from a
 * Google account (the portal is invite-only per the business rule — see
 * feedback_partners_invite_only). The signIn callback below rejects any
 * Google login whose email doesn't match an existing Partner row.
 *
 * Env vars (set on Vercel for prod + any preview you want to test against):
 *   AUTH_GOOGLE_ID      — Google OAuth 2.0 Web client ID
 *   AUTH_GOOGLE_SECRET  — Google OAuth 2.0 Web client secret
 * NextAuth v5 auto-picks these up when the provider has no explicit
 * clientId/clientSecret.
 *
 * Redirect URI to register in Google Cloud Console:
 *   https://fintella.partners/api/auth/callback/google
 */

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google,
    Credentials({
      id: "partner-login",
      name: "Partner Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        // Case-insensitive email lookup. Historically partner rows may have
        // been saved with mixed-case emails (signup doesn't normalize), so a
        // literal equality check would miss a row when the admin typed
        // "Jane@acme.com" during creation and the partner later tries to log
        // in with "jane@acme.com".
        const partner = await prisma.partner.findFirst({
          where: { email: { equals: email.trim(), mode: "insensitive" } },
        });

        if (!partner) return null;
        if (partner.status === "blocked") return null;
        if (!partner.passwordHash) return null;

        const valid = await compare(password, partner.passwordHash);
        if (!valid) return null;

        return {
          id: partner.id,
          email: partner.email,
          name: `${partner.firstName} ${partner.lastName}`,
          role: "partner",
          partnerCode: partner.partnerCode,
        };
      },
    }),
    Credentials({
      id: "impersonate-login",
      name: "Impersonate Partner",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.token as string;
        if (!token) return null;

        const record = await prisma.impersonationToken.findUnique({ where: { token } });
        if (!record) return null;
        if (record.used) return null;
        if (new Date() > record.expiresAt) return null;

        const partner = await prisma.partner.findUnique({
          where: { partnerCode: record.partnerCode },
        });
        if (!partner) return null;
        if (partner.status === "blocked") return null;

        await prisma.impersonationToken.update({
          where: { token },
          data: { used: true },
        });

        return {
          id: partner.id,
          email: partner.email,
          name: `${partner.firstName} ${partner.lastName}`,
          role: "partner",
          partnerCode: partner.partnerCode,
        };
      },
    }),
    Credentials({
      id: "admin-login",
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        // Case-insensitive lookup — same reasoning as the partner provider.
        const user = await prisma.user.findFirst({
          where: { email: { equals: email.trim(), mode: "insensitive" } },
        });
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // Gate Google sign-ins to invited partners only. Non-partner emails and
    // blocked partners are bounced back to /login with a human-readable
    // error query string that the login page renders inline.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.trim();
      if (!email) return "/login?error=google-no-email";
      const partner = await prisma.partner.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!partner) return "/login?error=not-invited";
      if (partner.status === "blocked") return "/login?error=blocked";
      return true;
    },
    async jwt({ token, user, account }) {
      // Credentials providers set user.role / user.partnerCode directly.
      if (user) {
        token.role = (user as any).role ?? token.role;
        token.partnerCode = (user as any).partnerCode ?? token.partnerCode;
        // Audit log: sign-in event (fire-and-forget)
        import("@/lib/audit-log").then(({ logAudit }) =>
          logAudit({
            action: "sign_in",
            actorEmail: (user.email || token.email || "unknown") as string,
            actorRole: ((user as any).role || token.role || "unknown") as string,
            actorId: (user as any).partnerCode || user.id || null,
            details: { provider: account?.provider || "credentials" },
          })
        ).catch(() => {});
        // Engagement: track portal login for partners
        if ((user as any).partnerCode) {
          import("@/lib/engagement").then(({ recordActivity }) =>
            recordActivity((user as any).partnerCode, "portal_login")
          ).catch(() => {});
        }
      }
      // Google sign-ins don't populate those fields — hydrate from the
      // Partner row keyed by email on the first JWT pass.
      if (account?.provider === "google" && token.email && !token.partnerCode) {
        const partner = await prisma.partner.findFirst({
          where: { email: { equals: token.email as string, mode: "insensitive" } },
        });
        if (partner) {
          token.role = "partner";
          token.partnerCode = partner.partnerCode;
          (token as any).name = `${partner.firstName} ${partner.lastName}`.trim();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).partnerCode = token.partnerCode;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
