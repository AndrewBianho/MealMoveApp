// Mock data used to seed the database and to drive the static style guide.
// Shapes match lib/types so the seed maps cleanly onto the schema.
import type { FoodCategory, Listing } from "./types";
import type { RetrievalHours } from "./hours";

export const CURRENT_USER = { name: "You", role: "volunteer" as const };

// The restaurant account viewing the restaurant console.
export const RESTAURANT = "Saxbys — Commons";

// Drop-off locations with their real constraints. Variety here is what makes
// the recommendation/matching meaningful.
export const DROP_OFFS: {
  name: string;
  acceptedCategories: FoodCategory[];
  refrigerated: boolean;
  capacity: number;
  notes: string;
  lat: number;
  lng: number;
  retrievalHours?: RetrievalHours;
}[] = [
  {
    name: "Community Fridge — 4th & Elm",
    acceptedCategories: ["prepared", "produce", "dairy", "bakery", "beverages"],
    refrigerated: true,
    capacity: 60,
    notes: "Refrigerated. No nut-containing items.",
    lat: 40.0362, // Malvern
    lng: -75.5138,
    retrievalHours: {
      mon: [{ open: "08:00", close: "20:00" }],
      tue: [{ open: "08:00", close: "20:00" }],
      wed: [{ open: "08:00", close: "20:00" }],
      thu: [{ open: "08:00", close: "20:00" }],
      fri: [{ open: "08:00", close: "20:00" }],
      sat: [{ open: "10:00", close: "16:00" }],
      sun: [],
    },
  },
  {
    name: "St. Mark's Shelter",
    acceptedCategories: ["prepared", "bakery", "packaged", "beverages"],
    refrigerated: false,
    capacity: 120,
    notes: "Hot meals welcome before 7pm. Not refrigerated.",
    lat: 40.0429, // Paoli
    lng: -75.4707,
    retrievalHours: {
      mon: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      tue: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      wed: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      thu: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      fri: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      sat: [],
      sun: [],
    },
  },
  {
    name: "Campus Pantry — Student Union",
    acceptedCategories: ["packaged", "bakery", "beverages", "produce"],
    refrigerated: false,
    capacity: 200,
    notes: "Shelf-stable & produce only. No prepared or dairy.",
    lat: 40.0454, // Berwyn
    lng: -75.4438,
  },
  {
    name: "Grace Kitchen",
    acceptedCategories: ["prepared", "dairy", "produce", "bakery", "packaged", "beverages"],
    refrigerated: true,
    capacity: 80,
    notes: "Full-service kitchen. Accepts everything.",
    lat: 40.0370, // Frazer
    lng: -75.5550,
  },
];

export const LISTINGS: Listing[] = [
  {
    // Demo: the one perpetually-urgent listing. lib/listings.ts pins this to
    // the <10 min band in dev (see ALWAYS_URGENT_TITLE) so the urgency UI —
    // tomato chip + pulse + 2-col feature — is always on screen to test.
    id: "PU-4821",
    title: "Mediterranean wraps & salads",
    imageUrl: "/food-wraps.jpg",
    source: "Saxbys — Commons",
    expiresAt: "6:51 PM",
    minutesLeft: 6,
    servings: 18,
    weightLbs: 14,
    distance: "0.4 mi",
    status: "open",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4822",
    title: "Bagels, pastries & coffee cake",
    imageUrl: "/food-bagels.jpg",
    source: "Bruegger's — Main St",
    expiresAt: "7:15 PM",
    minutesLeft: 48,
    servings: 40,
    weightLbs: 30,
    distance: "0.9 mi",
    status: "open",
    category: "bakery",
    perishable: false,
  },
  {
    id: "PU-4823",
    title: "Catered sandwich platters",
    imageUrl: "/food-sandwiches.jpg",
    source: "Conference Center",
    expiresAt: "8:30 PM",
    minutesLeft: 107,
    servings: 60,
    weightLbs: 48,
    distance: "1.1 mi",
    status: "open",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4824",
    title: "Soup, rolls & side salads",
    imageUrl: "/food-soup.jpg",
    source: "Dining Hall — North",
    expiresAt: "7:40 PM",
    minutesLeft: 57,
    servings: 35,
    weightLbs: 41,
    distance: "0.6 mi",
    status: "claimed",
    claimedBy: "Priya R.",
    dropOff: "Community Fridge — 4th & Elm",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4825",
    title: "Pizza by the slice",
    source: "Slice Co. — Quad",
    expiresAt: "6:30 PM",
    minutesLeft: 50,
    servings: 24,
    weightLbs: 26,
    distance: "0.3 mi",
    status: "in transit",
    claimedBy: "You",
    dropOff: "St. Mark's Shelter",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4818",
    title: "Roasted veg & grain bowls",
    source: "Greenhouse Cafe",
    expiresAt: "5:55 PM",
    minutesLeft: 0,
    servings: 28,
    weightLbs: 25,
    distance: "0.8 mi",
    status: "delivered",
    claimedBy: "You",
    dropOff: "Community Fridge — 4th & Elm",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4815",
    title: "Assorted deli sandwiches",
    source: "Corner Market",
    expiresAt: "4:10 PM",
    minutesLeft: 0,
    servings: 15,
    weightLbs: 11,
    distance: "1.4 mi",
    status: "expired",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4811",
    title: "Pasta trays & garlic bread",
    source: "Tony's Kitchen",
    expiresAt: "3:30 PM",
    minutesLeft: 0,
    servings: 50,
    weightLbs: 55,
    distance: "2.0 mi",
    status: "failed",
    claimedBy: "Sam O.",
    dropOff: "St. Mark's Shelter",
    category: "prepared",
    perishable: true,
  },
  {
    id: "PU-4826",
    title: "Cold brew & iced lattes",
    source: "Saxbys — Commons",
    expiresAt: "7:00 PM",
    minutesLeft: 52,
    servings: 30,
    weightLbs: 38,
    distance: "0.4 mi",
    status: "claimed",
    claimedBy: "Marcus L.",
    dropOff: "Community Fridge — 4th & Elm",
    category: "beverages",
    perishable: false,
  },
  {
    id: "PU-4809",
    title: "Breakfast sandwiches",
    source: "Saxbys — Commons",
    expiresAt: "10:30 AM",
    minutesLeft: 0,
    servings: 22,
    weightLbs: 16,
    distance: "0.4 mi",
    status: "delivered",
    claimedBy: "Dana K.",
    dropOff: "St. Mark's Shelter",
    category: "prepared",
    perishable: true,
  },
];
