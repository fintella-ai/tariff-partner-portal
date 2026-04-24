import type { MetadataRoute } from "next";

const BASE_URL = "https://fintella.partners";

/**
 * Landing + squeeze hidden while the ClickFunnels-style rebuild is in
 * flight (see src/app/page.tsx). Disallow crawling of `/` and `/apply`
 * so Google doesn't index the temporary /login redirect as the homepage.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/privacy", "/terms"],
        disallow: [
          "/",
          "/apply",
          "/admin",
          "/api",
          "/dashboard",
          "/signup",
          "/getstarted",
          "/impersonate",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
