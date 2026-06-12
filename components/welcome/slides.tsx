import type { Role } from "@prisma/client";
import type { ArtName } from "./art";

// Tones map to the semantic ramps for each slide's mono status chip, so meaning
// never rides on hue alone (the chip always carries a label too).
export type Tone = "rescued" | "urgent" | "transit" | "clay" | "route";

export type Slide = {
  id: string;
  /** mono status code shown in the chip, e.g. "route ready" */
  statusCode: string;
  tone: Tone;
  title: string; // may contain a {name} token, filled at render
  body: string;
  art: ArtName;
};

export type Deck = {
  /** where the final CTA sends the user */
  home: string;
  /** label of the final-slide primary button */
  cta: string;
  slides: Slide[];
};

const WELCOME = (body: string): Slide => ({
  id: "welcome",
  statusCode: "welcome",
  tone: "rescued",
  title: "Welcome, {name}",
  body,
  art: "welcome",
});

const MAP_ROUTE: Slide = {
  id: "map",
  statusCode: "route ready",
  tone: "route",
  title: "See the whole trip first",
  body: "Set your location, pick a restaurant, and we'll match the nearest drop-offs and open turn-by-turn directions. You always know where to go.",
  art: "map",
};

const CLAIM: Slide = {
  id: "claim",
  statusCode: "claim, deliver",
  tone: "rescued",
  title: "Claim it, then close the loop",
  body: "Claiming holds the pickup so no one else grabs it. Mark it delivered and you'll see the meals you just saved.",
  art: "claim",
};

const RELIABILITY: Slide = {
  id: "reliability",
  statusCode: "non-punitive",
  tone: "rescued",
  title: "Your reliability, shown kindly",
  body: "Showing up builds a calm score over the last 30 days. It's encouragement, never a grade or a callout.",
  art: "reliability",
};

const THEME_NAV: Slide = {
  id: "themenav",
  statusCode: "light · dark",
  tone: "transit",
  title: "Built for your phone",
  body: "A bottom tab bar keeps everything one thumb away, and you can switch between light and dark whenever you like.",
  art: "themenav",
};

export const SLIDES_BY_ROLE: Record<Role, Deck> = {
  volunteer: {
    home: "/",
    cta: "Start rescuing",
    slides: [
      WELCOME(
        "Meal Move helps you move surplus food from restaurants to people who need it. Here's a quick look at what you can do."
      ),
      MAP_ROUTE,
      CLAIM,
      RELIABILITY,
      THEME_NAV,
    ],
  },

  restaurant: {
    home: "/restaurant",
    cta: "Post a listing",
    slides: [
      WELCOME(
        "Meal Move gets your end-of-shift surplus to volunteers fast. Here's how the essentials work."
      ),
      {
        id: "post",
        statusCode: "post fast",
        tone: "rescued",
        title: "Post surplus in seconds",
        body: "Add what's available and when it expires. Volunteers see it right away and claim it before it spoils.",
        art: "claim",
      },
      {
        id: "covered",
        statusCode: "covered",
        tone: "route",
        title: "Know someone's on the way",
        body: "Once a volunteer claims a pickup you can see it's covered, so you can trust the food will actually move.",
        art: "map",
      },
      {
        id: "team",
        statusCode: "team",
        tone: "clay",
        title: "Bring your staff on",
        body: "Invite teammates so anyone on shift can post. Invites are email-based and you control who joins.",
        art: "team",
      },
      {
        ...THEME_NAV,
        title: "Built for the pass",
        body: "Post from your phone between tickets. A bottom tab bar keeps it quick, in light or dark.",
      },
    ],
  },

  drop_off_admin: {
    home: "/dropoff",
    cta: "Open drop-off",
    slides: [
      WELCOME(
        "Meal Move keeps you ahead of what's arriving at your drop-off. Here's the quick orientation."
      ),
      {
        id: "inbound",
        statusCode: "inbound",
        tone: "transit",
        title: "See what's inbound",
        body: "Track pickups headed your way and when they'll land, so you can be ready to receive them.",
        art: "map",
      },
      {
        id: "team",
        statusCode: "team",
        tone: "clay",
        title: "Add your receivers",
        body: "Invite the people who staff your location. Email invites, and you decide who can manage it.",
        art: "team",
      },
      {
        ...THEME_NAV,
        title: "Check it from anywhere",
        body: "A bottom tab bar and light or dark mode make it easy to glance at incoming deliveries on your phone.",
      },
    ],
  },

  org_admin: {
    home: "/",
    cta: "Go to the feed",
    slides: [
      WELCOME(
        "You're running the chapter. Here's a tour of what your volunteers, restaurants, and drop-offs now have."
      ),
      MAP_ROUTE,
      {
        ...CLAIM,
        title: "Claim, deliver, celebrate",
        body: "Volunteers hold a pickup, deliver it, and get a calm celebration of the meals saved. Fewer abandoned pickups.",
      },
      {
        id: "members",
        statusCode: "members",
        tone: "clay",
        title: "Provision your teams",
        body: "Invite restaurants and drop-off admins by email, and manage everyone from one members page.",
        art: "team",
      },
      {
        ...RELIABILITY,
        title: "Reliability at a glance",
        body: "See who's showing up with calm bars and percentages. Encouraging, never a leaderboard.",
      },
      {
        ...THEME_NAV,
        title: "Works on every phone",
        body: "Bottom-tab navigation and a light or dark theme, so the whole org can run it from a pocket.",
      },
    ],
  },
};
