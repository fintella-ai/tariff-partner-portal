import type { MetadataRoute } from "next";

const BASE_URL = "https://fintella.partners";

/**
 * Landing + squeeze pages are hidden while we rebuild on a dedicated
 * page-builder platform (see src/app/page.tsx for full context). Sitemap
 * intentionally omits both routes until the external landing is live and
 * pointing at fintella.partners.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
