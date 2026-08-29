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

// The volunteer you sign in as in demo mode. The display name reads as a real
// person (so the app never greets you as the placeholder "You"), while the login
// email stays the stable, memorable `you@campus.edu` — it's a credential, never
// shown as identity. Must match the "Volunteer" prefill in LoginForm's DEMO grid
// and the claimedBy on this persona's rescues in lib/mock.ts.
const DEMO_VOLUNTEER = { name: "Robin Alvarez", email: "you@campus.edu" };

// The second demo volunteer, mid-delivery — see lib/mock.ts and LoginForm's DEMO grid.
const MID_RESCUE_VOLUNTEER = { name: "Casey W." };

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
  // All demo accounts share the password "MealMove1".
  const passwordHash = await bcrypt.hash("MealMove1", 10);

  // Two starting organizations. Malvern auto-joins @malvernprep.org volunteers;
  // everyone else falls to the default. Exactly one isDefault org. Upserted so
  // reruns (full reseed or demo-only reset) don't create duplicate rows.
  const defaultOrg = await prisma.organization.upsert({
    where: { id: "org_default_cfr" },
    update: {},
    create: { id: "org_default_cfr", name: "None", isDefault: true },
  });
  const malvernOrg = await prisma.organization.upsert({
    where: { id: "org_malvern" },
    update: {},
    create: { id: "org_malvern", name: "Malvern", emailDomain: "malvernprep.org" },
  });
  // Volunteers and org admins auto-join by email domain; restaurant/drop_off
  // accounts stay org-less (partners are global, never org-scoped).
  const orgForEmail = (email: string) =>
    email.toLowerCase().endsWith("@malvernprep.org") ? malvernOrg.id : defaultOrg.id;

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
    // Seed the flagship demo restaurant with relationship-memory notes so the
    // org-admin "Partner notes" panel showcases the handoff knowledge feature.
    const notes =
      sources[i] === RESTAURANT
        ? {
            primaryContact: "Maria — closing shift manager",
            contactInfo: "215-555-0188",
            lastContactAt: new Date(anchor.getTime() - 6 * 24 * 60 * 60_000),
            quirks:
              "Bring a cooler bag for the pastries. Dead on Tuesdays — best surplus Fri–Sun after 8pm.",
          }
        : {};
    const r = await prisma.restaurant.create({
      data: { name: sources[i], address: "Main Line", lat, lng, demo: true, ...notes },
    });
    restaurantId.set(sources[i], r.id);
  }

  // Drop-off locations, with their real intake constraints.
  const dropOffId = new Map<string, string>();
  for (const d of DROP_OFFS) {
    // First drop-off carries relationship-memory notes so the org-admin panel
    // showcases the feature on the drop-off side too.
    const relNotes =
      d.name === DROP_OFFS[0].name
        ? {
            primaryContact: "Front desk (ask for the kitchen lead)",
            contactInfo: "kitchen@shelter.example",
            lastContactAt: new Date(anchor.getTime() - 2 * 24 * 60 * 60_000),
            quirks: "Use the loading dock on Elm, not the main door. Closed Sundays.",
          }
        : {};
    const created = await prisma.dropOff.create({
      data: {
        name: d.name,
        address: "Campus",
        lat: d.lat,
        lng: d.lng,
        acceptedCategories: d.acceptedCategories,
        refrigerated: d.refrigerated,
        notes: d.notes,
        demo: true,
        ...relNotes,
        ...(d.retrievalHours
          ? { retrievalHours: d.retrievalHours as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    dropOffId.set(d.name, created.id);
  }

  // One rescue at a time: the app rejects a second live claim per volunteer,
  // so the demo world must honor the same rule or its data becomes
  // unreachable through the UI. Fail loudly if a fixture edit breaks it.
  const liveByVolunteer = new Map<string, number>();
  for (const l of LISTINGS) {
    // "open" counts too: a multi-car listing's early claims are live holds.
    // A buddy seat is also a live claim (either seat blocks a second rescue).
    if (l.claimedBy && ["open", "claimed", "in transit", "taken home"].includes(l.status)) {
      liveByVolunteer.set(l.claimedBy, (liveByVolunteer.get(l.claimedBy) ?? 0) + 1);
      if (l.buddyName) {
        liveByVolunteer.set(l.buddyName, (liveByVolunteer.get(l.buddyName) ?? 0) + 1);
      }
    }
  }
  liveByVolunteer.forEach((count, name) => {
    if (count > 1) {
      throw new Error(
        `Demo fixture breaks the one-rescue-at-a-time rule: ${name} has ${count} live claims.`
      );
    }
  });

  // Volunteers (everyone who has claimed something, plus the demo persona
  // "Robin Alvarez" — the account you sign in as). Upserted so a
  // reset re-creates them without colliding on email. Seeded accounts default to
  // the demo world so logging in as one lands straight in the sample data.
  const volunteerId = new Map<string, string>();
  const names = Array.from(
    new Set<string>([
      DEMO_VOLUNTEER.name,
      ...(LISTINGS.flatMap((l) => [l.claimedBy, l.buddyName]).filter(Boolean) as string[]),
    ])
  );
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    // The persona keeps its stable login email; everyone else derives one from
    // their name. The email is a credential, never shown — so pinning it lets a
    // reseed update the persona in place (no orphaned "you@campus.edu" login).
    const email =
      name === DEMO_VOLUNTEER.name
        ? DEMO_VOLUNTEER.email
        : `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@campus.edu`;
    // Spread volunteers around Malvern (same spiral as restaurants) and opt them
    // into notifications so the escalating broadcast has demo targets to reach.
    const { lat, lng } = placeAround(i);
    const geo = { lat, lng, notificationsEnabled: true };
    const organizationId = orgForEmail(email);
    const u = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role: "volunteer",
        passwordHash,
        dataMode: "demo",
        demo: true,
        organizationId,
        // Demo logins are shared, so anything a visitor typed into the profile
        // is someone else's data by the next session. Scrub it on every reseed.
        phone: null,
        imageUrl: null,
        ...geo,
      },
      create: {
        name,
        email,
        role: "volunteer",
        passwordHash,
        dataMode: "demo",
        demo: true,
        organizationId,
        ...geo,
      },
    });
    volunteerId.set(name, u.id);
  }

  // Cross-role demo accounts (all password: "MealMove1"), defaulting to demo.
  await prisma.user.upsert({
    where: { email: "saxbys@campus.edu" },
    update: {
      passwordHash,
      role: "restaurant",
      phone: null,
      imageUrl: null,
      restaurantId: restaurantId.get(RESTAURANT),
      dataMode: "demo",
      demo: true,
    },
    create: {
      name: "Saxbys manager",
      email: "saxbys@campus.edu",
      role: "restaurant",
      passwordHash,
      restaurantId: restaurantId.get(RESTAURANT),
      dataMode: "demo",
      demo: true,
    },
  });
  // A per-location drop-off account. Linked to St. Mark's Shelter — the
  // destination of Robin's in-flight rescue — so the seeded three-way chat and
  // the drop-off console both showcase a location speaking for itself.
  const demoDropOffId = dropOffId.get("St. Mark's Shelter") ?? null;
  const dropOffAdmin = await prisma.user.upsert({
    where: { email: "dropoff@campus.edu" },
    update: {
      passwordHash,
      role: "drop_off",
      phone: null,
      imageUrl: null,
      dropOffId: demoDropOffId,
      dataMode: "demo",
      demo: true,
    },
    create: {
      name: "St. Mark's Shelter",
      email: "dropoff@campus.edu",
      role: "drop_off",
      dropOffId: demoDropOffId,
      passwordHash,
      dataMode: "demo",
      demo: true,
    },
  });
  const orgAdmin = await prisma.user.upsert({
    where: { email: "admin@campus.edu" },
    update: {
      passwordHash,
      role: "org_admin",
      phone: null,
      imageUrl: null,
      dataMode: "demo",
      demo: true,
      organizationId: orgForEmail("admin@campus.edu"),
    },
    create: {
      name: "Org admin",
      email: "admin@campus.edu",
      role: "org_admin",
      passwordHash,
      dataMode: "demo",
      demo: true,
      organizationId: orgForEmail("admin@campus.edu"),
    },
  });

  // One chapter update so the volunteer's Updates inbox isn't empty in demo
  // mode — a warm, non-shouty note from the org admin to every demo volunteer.
  // Fixed id so reseeds update this row in place instead of stacking duplicates;
  // recipientIds is rewritten each run since a full wipe regenerates user ids.
  const demoVolunteerIds = Array.from(volunteerId.values());
  const demoUpdate = {
    authorId: orgAdmin.id,
    title: "Thanks for a strong week of rescues",
    body: "Hi everyone — together we moved just over 400 servings this week, the most we've ever rescued in seven days. Two small reminders before your next pickup: check the drop-off's hours so you're not left waiting at a closed door, and snap the pickup photo when you grab the food — it's how the restaurant knows a real person showed up. You make this work. See you out there.",
    audienceLabel: "Everyone",
    demo: true,
    recipientCount: demoVolunteerIds.length,
    recipientIds: demoVolunteerIds,
    organizationId: orgForEmail("admin@campus.edu"),
    // Dated to yesterday so it reads as a recent note, not this exact instant.
    createdAt: new Date(anchor.getTime() - 20 * 60 * 60 * 1000),
  };
  await prisma.announcement.upsert({
    where: { id: "demo_update_welcome" },
    update: demoUpdate,
    create: { id: "demo_update_welcome", ...demoUpdate },
  });

  // Listings + their pickups + event trail.
  for (const l of LISTINGS) {
    const status = toEnum(l.status);
    const delivered = status === "delivered";
    // A taken-home pickup was claimed yesterday and is still chilling overnight
    // for a next-day drop — deliverBy is tomorrow at 8 PM (mirrors the action).
    const takenHome = status === "taken_home";
    const inTransit = status === "in_transit";
    const hasClaim = Boolean(l.claimedBy);

    // When the volunteer claimed it. Delivered pickups get a realistic claim →
    // delivery span (25–54 min, deterministic) so "hours driven" reads as real
    // road time; taken-home was claimed ~18h ago; in-transit ~20 min ago (so
    // the pickup photo + departure sit believably in the past); others claimed
    // at the anchor.
    const driveMin = 25 + (l.servings % 30);
    const claimAt = delivered
      ? new Date(anchor.getTime() - driveMin * 60_000)
      : takenHome
        ? new Date(anchor.getTime() - 18 * 60 * 60_000)
        : inTransit
          ? new Date(anchor.getTime() - 20 * 60_000)
          : anchor;

    // Realistic posting→claim gap (4–29 min, deterministic) so the ops "median
    // time to claim" reads as real minutes, not 0. Unclaimed listings were just
    // posted (the anchor).
    const claimDelayMin = 4 + (l.servings % 26);
    const postedAt = hasClaim
      ? new Date(claimAt.getTime() - claimDelayMin * 60_000)
      : anchor;
    // A claimed listing's window always covers its claim (so it counts as
    // "claimed before expiry" in ops metrics). An unclaimed one keeps its frozen
    // offset: positive minutesLeft stays that many minutes out; a spent listing
    // sits 30 min in the past (reads as 0).
    const expiresAt = hasClaim
      ? new Date(claimAt.getTime() + Math.max(l.minutesLeft, 30) * 60_000)
      : new Date(anchor.getTime() + (l.minutesLeft > 0 ? l.minutesLeft : -30) * 60_000);

    const listing = await prisma.foodListing.create({
      data: {
        title: l.title,
        imageUrl: l.imageUrl ?? null,
        servings: l.servings,
        weightLbs: l.weightLbs ?? null,
        category: l.category ?? "prepared",
        perishable: l.perishable ?? false,
        allergens: l.allergens ?? [],
        tempHandling: l.tempHandling ?? null,
        notes: l.notes ?? null,
        demo: true,
        status,
        carsNeeded: l.carsNeeded ?? null,
        restaurantId: restaurantId.get(l.source)!,
        // Destination-first claiming: the drop-off is the claiming volunteer's
        // choice, so unclaimed demo listings stay destination-less — the
        // showcase then exercises the picker on the detail page.
        dropOffId: hasClaim && l.dropOff ? dropOffId.get(l.dropOff)! : null,
        postedAt,
        expiresAt,
        events: { create: { type: "posted", at: postedAt } },
      },
    });

    if (l.claimedBy) {
      const actorId = volunteerId.get(l.claimedBy)!;
      const deliverBy = new Date(anchor);
      deliverBy.setDate(deliverBy.getDate() + 1);
      deliverBy.setHours(20, 0, 0, 0);
      const takenHomeAt = takenHome ? new Date(anchor.getTime() - 3 * 60 * 60_000) : null;
      // Most delivered demo pickups were "as described"; an occasional "partly"
      // (deterministic, by servings) so the private rescue-accuracy read-out has
      // realistic, non-perfect data for the restaurant + org-admin views.
      const accuracy = delivered
        ? l.servings % 5 === 0
          ? ("partly" as const)
          : ("yes" as const)
        : null;
      // Anything past the claimed stage carries its pickup proof photo (the
      // photo is what advances a claim), and a completed safety checklist so
      // the detail page's "n/3 confirmed" reads as done, not skipped.
      const pastClaim = delivered || inTransit || takenHome;
      await prisma.pickup.create({
        data: {
          listingId: listing.id,
          volunteerId: actorId,
          buddyId: l.buddyName ? volunteerId.get(l.buddyName)! : null,
          claimedAt: claimAt,
          holdUntil: new Date(claimAt.getTime() + 15 * 60_000),
          deliveredAt: delivered ? anchor : null,
          takenHomeAt,
          deliverBy: takenHome ? deliverBy : null,
          photoAtPickupUrl: pastClaim ? l.imageUrl ?? null : null,
          photoAtDeliveryUrl: delivered ? l.imageUrl ?? null : null,
          safetyChecklist: pastClaim
            ? { tempKept: true, underTwoHours: true, sealed: true }
            : undefined,
          rescueAccuracy: accuracy,
          rescueAccuracyNote:
            accuracy === "partly" ? "A couple of trays were already gone." : null,
        },
      });
      await prisma.listingEvent.create({
        data: { listingId: listing.id, type: "claimed", actorId, at: claimAt },
      });
      // The claimed → in_transit transition lives only in the event log; the
      // lifecycle stepper reads it back as "Picked up", so in-flight and
      // delivered rescues need one.
      if (inTransit || delivered) {
        await prisma.listingEvent.create({
          data: {
            listingId: listing.id,
            type: "in_transit",
            actorId,
            at: new Date(claimAt.getTime() + 8 * 60_000),
          },
        });
      }
      if (status === "delivered" || status === "failed" || status === "taken_home") {
        // delivered/taken-home happened after the claim; a failed claim is
        // stamped at the listing's expiry.
        const at = delivered ? anchor : takenHome ? takenHomeAt! : expiresAt;
        await prisma.listingEvent.create({
          data: { listingId: listing.id, type: status, actorId, at },
        });
      }
      // Seed the coordination thread on Casey's in-flight rescue so the chat
      // shows a real back-and-forth (volunteer ↔ drop-off) out of the box.
      if (inTransit && l.claimedBy === MID_RESCUE_VOLUNTEER.name) {
        await prisma.message.create({
          data: {
            listingId: listing.id,
            senderId: actorId,
            body: "On my way — about 10 minutes out with the pizza.",
            createdAt: new Date(claimAt.getTime() + 10 * 60_000),
          },
        });
        await prisma.message.create({
          data: {
            listingId: listing.id,
            senderId: dropOffAdmin.id,
            body: "Perfect — come to the side door on Elm, we'll prop it open for you.",
            createdAt: new Date(claimAt.getTime() + 12 * 60_000),
          },
        });
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
      imageUrl: "/food-pastries.jpg",
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
        imageUrl: "/food-pastries.jpg",
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

  // A demo service notice so the showcase shows the "hours change" flow — the
  // Community Fridge is closing early today (clears 5h after the anchor).
  const firstDropOffId = dropOffId.get(DROP_OFFS[0].name);
  if (firstDropOffId) {
    await prisma.dropOffNotice.create({
      data: {
        dropOffId: firstDropOffId,
        authorId: dropOffAdmin.id,
        kind: "hours",
        body: "Closing at 6 PM today for a building event — please arrive before then.",
        until: new Date(anchor.getTime() + 5 * 60 * 60_000),
        demo: true,
      },
    });
  }

  return {
    restaurants: restaurantId.size,
    dropOffs: dropOffId.size,
    volunteers: volunteerId.size,
    listings: LISTINGS.length,
    schedules: 1,
    scheduled: scheduledCount,
    notices: firstDropOffId ? 1 : 0,
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
  await prisma.dropOffNotice.deleteMany({ where: { dropOff: { demo: true } } });
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
