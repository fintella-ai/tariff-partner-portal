import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Public pages — accessible to anyone, no redirects
  if (pathname.startsWith("/docs/") || pathname.startsWith("/signup")) {
    return NextResponse.next();
  }

  // Public routes (login, home)
  if (pathname === "/login" || pathname === "/" || pathname.startsWith("/api/auth")) {
    // If already logged in, redirect to appropriate dashboard
    if (session?.user) {
      const role = (session.user as any).role;
      if (role === "admin" || role === "super_admin") {
        return NextResponse.redirect(new URL("/admin/partners", req.url));
      }
      return NextResponse.redirect(new URL("/dashboard/home", req.url));
    }
    return NextResponse.next();
  }

  // Protected routes — require auth
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Admin-only routes
  if (pathname.startsWith("/admin")) {
    const role = (session.user as any).role;
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard/home", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
