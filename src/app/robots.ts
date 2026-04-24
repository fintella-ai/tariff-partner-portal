import type { MetadataRoute } from "next";

const BASE_URL = "https://fintella.partners";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/apply", "/login", "/privacy", "/terms"],
        disallow: [
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
