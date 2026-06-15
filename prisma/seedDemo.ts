// Builds the curated DEMO world (demo = true everywhere) from lib/mock.ts so the
// shapes line up with what the frontend renders. Imported by both prisma/seed.ts
// (full wipe + reseed) and prisma/reset-demo.ts (reset only the demo world,
// leaving real data untouched). No side effects on import — call seedDemo().
import { PrismaClient, Prisma, type ListingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DROP_OFFS, LISTINGS, RESTAURANT } from "../lib/mock";
import { occurrencesWithin } from "../lib/recurring";

// "in transit" (UI) → "in_transit" (Postgres enum).
function toEnum(status: string): ListingStatus {
  return status.replace(/ /g, "_") as ListingStatus;
}

// Spread restaurants deterministically around Malvern Prep so the rescue map
// shows realistic, spaced-out routes (not a single cluster). Place restaurant i
// on a golden-angle spiral, radius cycling 1.5/3/4.5 mi, converting miles→deg.
const MALVERN = { lat: 40.02724, lng: -75.51239 };
const GOLDEN = 2.399963229728653; // radians
function placeAround(i: number): { lat: number; lng: number } {
  const miles = [1.5, 3, 4.5][i % 3];
  const angle = i * GOLDEN;
  const dLat = (miles * Math.cos(angle)) / 69;
  const dLng = (miles * Math.sin(angle)) / (69 * Math.cos((MALVERN.lat * Math.PI) / 180));
  return { lat: MALVERN.lat + dLat, lng: MALVERN.lng + dLng };
}

export async function seedDemo(prisma: PrismaClient) {
  // All demo accounts share the password "password".
  const passwordHash = await bcrypt.hash("password", 10);

  // One anchor for the whole seed. Demo listings store this as their postedAt
  // and derive expiresAt from it, so "minutes left" reads as a fixed offset
  // (expiresAt − postedAt) instead of ticking against the wall clock — demo
  // time never drifts. See displayMinutesLeft() in lib/listings.ts.
  const anchor = new Date();

  // Restaurants, derived from unique listing sources — spread around Malvern Prep.
  const restaurantId = new Map<string, string>();
  const sources = Array.from(new Set(LISTINGS.map((l) => l.source)));
  for (let i = 0; i < sources.length; i++) {
    const { lat, lng } = placeAround(i);
    const r = await prisma.restaurant.create({
      data: { name: sources[i], address: "Main Line", lat, lng, demo: true },
    });
    restaurantId.set(sources[i], r.id);
  }

  // Drop-off locations, with their real intake constraints.
  const dropOffId = new Map<string, string>();
  for (const d of DROP_OFFS) {
    const created = await prisma.dropOff.create({
      data: {
        name: d.name,
        address: "Campus",
        lat: d.lat,
        lng: d.lng,
        acceptedCategories: d.acceptedCategories,
        refrigerated: d.refrigerated,
        capacity: d.capacity,
        notes: d.notes,
        demo: true,
        ...(d.retrievalHours
          ? { retrievalHours: d.retrievalHours as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    dropOffId.set(d.name, created.id);
  }

  // Volunteers (everyone who has claimed something, plus "You"). Upserted so a
  // reset re-creates them without colliding on email. Seeded accounts default to
  // the demo world so logging in as one lands straight in the sample data.
  const volunteerId = new Map<string, string>();
  const names = Array.from(
    new Set<string>(["You", ...(LISTINGS.map((l) => l.claimedBy).filter(Boolean) as string[])])
  );
  for (const name of names) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@campus.edu`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { name, role: "volunteer", passwordHash, dataMode: "demo" },
      create: { name, email, role: "volunteer", passwordHash, dataMode: "demo" },
    });
    volunteerId.set(name, u.id);
  }

  // Cross-role demo accounts (all password: "password"), defaulting to demo.
  await prisma.user.upsert({
    where: { email: "saxbys@campus.edu" },
    update: {
      passwordHash,
      role: "restaurant",
      restaurantId: restaurantId.get(RESTAURANT),
      dataMode: "demo",
    },
    create: {
      name: "Saxbys manager",
      email: "saxbys@campus.edu",
      role: "restaurant",
      passwordHash,
      restaurantId: restaurantId.get(RESTAURANT),
      dataMode: "demo",
    },
  });
  await prisma.user.upsert({
    where: { email: "dropoff@campus.edu" },
    update: { passwordHash, role: "drop_off_admin", dataMode: "demo" },
    create: {
      name: "Drop-off admin",
      email: "dropoff@campus.edu",
      role: "drop_off_admin",
      passwordHash,
      dataMode: "demo",
    },
  });
  await prisma.user.upsert({
    where: { email: "admin@campus.edu" },
    update: { passwordHash, role: "org_admin", dataMode: "demo" },
    create: {
      name: "Org admin",
      email: "admin@campus.edu",
      role: "org_admin",
      passwordHash,
      dataMode: "demo",
    },
  });

  // Listings + their pickups + event trail.
  for (const l of LISTINGS) {
    const status = toEnum(l.status);
    // Frozen offset from the anchor: a positive minutesLeft stays exactly that
    // many minutes out; a spent listing sits 30 min in the past (reads as 0).
    const expiresAt = new Date(anchor.getTime() + (l.minutesLeft > 0 ? l.minutesLeft : -30) * 60_000);

    const listing = await prisma.foodListing.create({
      data: {
        title: l.title,
        imageUrl: l.imageUrl ?? null,
        servings: l.servings,
        weightLbs: l.weightLbs ?? null,
        category: l.category ?? "prepared",
        perishable: l.perishable ?? false,
        notes: l.notes ?? null,
        demo: true,
        status,
        restaurantId: restaurantId.get(l.source)!,
        dropOffId: l.dropOff ? dropOffId.get(l.dropOff)! : null,
        postedAt: anchor,
        expiresAt,
        events: { create: { type: "posted" } },
      },
    });

    if (l.claimedBy) {
      const actorId = volunteerId.get(l.claimedBy)!;
      await prisma.pickup.create({
        data: {
          listingId: listing.id,
          volunteerId: actorId,
          holdUntil: new Date(Date.now() + 15 * 60_000),
          deliveredAt: status === "delivered" ? new Date() : null,
        },
      });
      await prisma.listingEvent.create({ data: { listingId: listing.id, type: "claimed", actorId } });
      if (status === "delivered" || status === "failed") {
        await prisma.listingEvent.create({ data: { listingId: listing.id, type: status, actorId } });
      }
    }
  }

  // A recurring schedule (daily, end of day) so demo mode showcases the
  // "Coming up" feed — its upcoming, locked pickups are materialized inline.
  const saxbysId = restaurantId.get(RESTAURANT)!;
  const rule = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 20 * 60, windowMinutes: 120 };
  const schedule = await prisma.recurringPost.create({
    data: {
      restaurantId: saxbysId,
      title: "End-of-day pastries & coffee",
      servings: 18,
      category: "bakery",
      notes: "Boxed at the counter — ask for the closing shift.",
      daysOfWeek: rule.daysOfWeek,
      timeOfDay: rule.timeOfDay,
      windowMinutes: rule.windowMinutes,
      demo: true,
    },
  });
  let scheduledCount = 0;
  for (const o of occurrencesWithin(rule, 4)) {
    await prisma.foodListing.create({
      data: {
        title: schedule.title,
        servings: schedule.servings,
        category: "bakery",
        notes: schedule.notes,
        demo: true,
        status: "open",
        restaurantId: saxbysId,
        recurringPostId: schedule.id,
        availableAt: o.availableAt,
        expiresAt: o.expiresAt,
        events: { create: { type: "posted", meta: { scheduled: true } } },
      },
    });
    scheduledCount++;
  }

  return {
    restaurants: restaurantId.size,
    dropOffs: dropOffId.size,
    volunteers: volunteerId.size,
    listings: LISTINGS.length,
    schedules: 1,
    scheduled: scheduledCount,
  };
}

// Wipe only the curated DEMO world (every demo-flagged row plus the
// transactional rows hanging off demo listings), then rebuild it pristine.
// Real listings, locations, and accounts are never touched. Shared by the
// `db:demo:reset` script and the sign-out reset (app/actions.ts), so the demo
// always returns to its showcase state. Order is FK-safe.
export async function resetDemoWorld(prisma: PrismaClient) {
  const onDemoListing = { listing: { demo: true } };
  await prisma.message.deleteMany({ where: onDemoListing });
  await prisma.buddyInvite.deleteMany({ where: onDemoListing });
  await prisma.listingEvent.deleteMany({ where: onDemoListing });
  await prisma.pickup.deleteMany({ where: onDemoListing });
  await prisma.foodListing.deleteMany({ where: { demo: true } });
  await prisma.recurringPost.deleteMany({ where: { demo: true } });
  await prisma.dropOff.deleteMany({ where: { demo: true } });

  // Detach any members from demo restaurants before deleting them (e.g. the
  // saxbys demo account) — seedDemo re-links them when it recreates the org.
  const demoRestaurants = await prisma.restaurant.findMany({
    where: { demo: true },
    select: { id: true },
  });
  if (demoRestaurants.length > 0) {
    const ids = demoRestaurants.map((r) => r.id);
    await prisma.user.updateMany({
      where: { restaurantId: { in: ids } },
      data: { restaurantId: null },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
  }

  return seedDemo(prisma);
}
