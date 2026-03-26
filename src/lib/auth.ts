import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";
import { fetchPartner, getDemoPartner } from "./hubspot";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: "partner-login",
      name: "Partner Login",
      credentials: {
        email: { label: "Email", type: "email" },
        partnerCode: { label: "Partner Code", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const partnerCode = credentials?.partnerCode as string;

        if (!email || !partnerCode) return null;

        // Check if partner is blocked
        const profile = await prisma.partnerProfile.findUnique({
          where: { partnerCode },
        });
        if (profile?.isBlocked) return null;

        // Demo mode
        const isDemo = !process.env.HUBSPOT_PRIVATE_TOKEN || process.env.HUBSPOT_PRIVATE_TOKEN === "YOUR_PRIVATE_APP_TOKEN";
        if (isDemo) {
          const demo = getDemoPartner(email, partnerCode);
          return {
            id: demo.id,
            email,
            name: `${demo.properties.firstname} ${demo.properties.lastname}`,
            role: "partner",
            partnerCode,
          };
        }

        // Validate against HubSpot
        const partner = await fetchPartner(email, partnerCode);
        if (!partner) return null;

        return {
          id: partner.id,
          email: partner.properties.email,
          name: `${partner.properties.firstname} ${partner.properties.lastname}`,
          role: "partner",
          partnerCode: partner.properties.partner_code,
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

        const user = await prisma.user.findUnique({ where: { email } });
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
