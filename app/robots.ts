import type { MetadataRoute } from "next";

/**
 * Meal Move is a tool for a chapter's members, not a site to be indexed. Almost
 * every route redirects an anonymous visitor to sign-in anyway, so the value
 * here is narrow and specific: keep the internal design reference out of search
 * results, and keep the token-bearing URLs (password reset, org-admin invites)
 * from being crawled at all.
 *
 * robots.txt is a crawl instruction, not an access control — a disallowed URL
 * that someone links to can still be indexed. The pages that actually carry a
 * token also set `robots: { index: false }` in their own metadata, which is the
 * directive that keeps them out of the index. Neither is a substitute for the
 * auth gate; both sit in front of it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/privacy"],
        disallow: [
          "/api/",
          "/admin",
          "/admin-invite",
          "/dropoff",
          "/dropoffs",
          "/restaurant",
          "/restaurants",
          "/listings",
          "/pickups",
          "/impact",
          "/map",
          "/updates",
          "/profile",
          "/settings",
          "/styleguide",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    host: "https://mealmove.org",
  };
}
