import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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

        const partner = await prisma.partner.findFirst({
          where: { email: email.trim() },
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

        const user = await prisma.user.findUnique({ where: { email: email.trim() } });
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
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.partnerCode = (user as any).partnerCode;
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
