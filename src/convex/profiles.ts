import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { autoApproveRiders } from "./lib/db";
import {
  requireUserId,
  getUserIdOrNull,
  normalizePhone,
  requireNonEmpty,
} from "./lib/auth";
import {
  getCallerUser,
  getProfile,
  getRider,
  isGuestSession,
  isReservedAdmin,
} from "./lib/db";
import {
  RESERVED_ADMIN_EMAIL,
  isReservedAdminEmail,
} from "./lib/adminEmail";

/**
 * Current user's FETCH profile, or null when onboarding has not happened yet.
 *
 * Also null — not a thrown error — when nobody is signed in, because
 * `/rider/register` reads this query while signed out on purpose: that screen
 * is outside `RequireAuth` and its account step is what creates the session.
 * Throwing here surfaced as an uncaught server error and the route error
 * boundary replaced the whole form with "This screen could not load".
 *
 * The three states stay distinguishable, which is what the client relies on:
 * `undefined` is still loading, `null` is a settled "no profile", and an object
 * is a real profile.
 */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdOrNull(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

/**
 * Record who to call if this account cannot be reached mid-trip.
 *
 * One person, two fields, and both are optional as a pair: saving a name with
 * no number is not a contact, and a number with no name is a number in a
 * stranger's phone. Either both are set, or neither is.
 */
export const setEmergencyContact = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");

    const name = args.name?.trim().slice(0, 80) || undefined;
    const phone = args.phone ? normalizePhone(args.phone) : undefined;
    if (Boolean(name) !== Boolean(phone)) {
      throw new Error("Add both a name and a number, or neither.");
    }

    await ctx.db.patch(profile._id, {
      emergencyName: name,
      emergencyPhone: phone,
    });
    return { emergencyName: name ?? null, emergencyPhone: phone ?? null };
  },
});

/**
 * Change the name and number the app introduces you by.
 *
 * Both are editable after onboarding because both go stale. A phone number is
 * replaced far more often than a name — a prepaid SIM gets lost, a shared
 * phone gets sold — and a rider we cannot call when a trip goes wrong is the
 * whole reason the number is on the profile at all.
 *
 * A rider's details live in two places: the profile, and the rider row a
 * passenger is shown while they are being carried. Both are written here. A
 * rider row left holding the old number means a commuter calling a stranger
 * mid-trip, which is exactly the failure the field exists to prevent.
 */
export const updateMyProfile = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");

    const name = requireNonEmpty(args.name, "Name");
    const phone = normalizePhone(args.phone);

    await ctx.db.patch(profile._id, { name, phone });

    const rider = await getRider(ctx, userId);
    if (rider) await ctx.db.patch(rider._id, { name, phone });

    return { name, phone };
  },
});

/**
 * Upper bound on an uploaded photo.
 *
 * 5 MB of JPEG is far more than a profile picture needs and low enough that a
 * phone on a slow connection in a barangay still finishes. The file type is
 * checked too, but the size limit is the one that actually protects the upload
 * path, so it is enforced on the client as well as here.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A one-time URL the browser uploads the photo bytes to directly.
 *
 * The file goes straight to Convex's storage from the client rather than
 * through the mutation, so a 5 MB upload never occupies a database transaction
 * and cannot be lost to a function timeout halfway through.
 */
export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attach an uploaded photo to this profile.
 *
 * The server fetches the stored file's metadata rather than trusting a
 * content type sent alongside the id: an upload url is a bearer capability
 * anyone can post, so the id it hands back proves nothing about what is behind
 * it. Checking the real blob means a client cannot point a profile at an
 * arbitrary file already in storage.
 *
 * Replaces rather than accumulates: the previous photo is deleted, so
 * replacing your picture a dozen times does not leave a dozen orphaned blobs
 * being served and paid for forever.
 */
export const setPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");

    // Read the stored file's own metadata rather than trusting anything the
    // client says about it: an upload url is a bearer capability, so the id it
    // hands back proves nothing about what is behind it.
    const blob = await ctx.db.system.get(args.storageId);
    if (!blob) throw new Error("That upload was not found. Please try again.");
    const contentType = blob.contentType ?? "application/octet-stream";
    if (!PHOTO_TYPES.includes(contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Upload a JPEG, PNG or WebP image.");
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That photo is too large. Pick one under 5 MB.");
    }

    const previous = profile.photoId;
    await ctx.db.patch(profile._id, { photoId: args.storageId });
    // Only after the row points at the new blob, so a failed delete can never
    // leave a profile referencing something that is gone.
    if (previous && previous !== args.storageId) {
      await ctx.storage.delete(previous);
    }
    return args.storageId;
  },
});

/** Drop the profile picture and delete the stored file. */
export const removePhoto = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("Complete your profile first.");
    if (!profile.photoId) return;
    await ctx.db.patch(profile._id, { photoId: undefined });
    await ctx.storage.delete(profile.photoId);
  },
});

/**
 * A URL for this profile's photo, or null when there is none.
 *
 * Regenerated on every read rather than stored, so the URL can expire instead
 * of being a permanent address for a file anybody who ever saw it can fetch.
 */
export const myPhotoUrl = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile?.photoId) return null;
    return await ctx.storage.getUrl(profile.photoId);
  },
});

/** Create the profile once, right after first sign-in. */
export const createProfile = mutation({
  args: {
    role: v.union(v.literal("commuter"), v.literal("rider")),
    name: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;

    const name = requireNonEmpty(args.name, "Name");
    const phone = normalizePhone(args.phone);

    // The reserved admin address must land on the admin seat, not on a riding
    // role. The client sends it to the console before onboarding can offer
    // this form, so reaching here means something bypassed the redirect.
    if (await isReservedAdmin(ctx)) {
      throw new Error(
        "This is the Fetch owner account. It goes straight to the admin console.",
      );
    }

    const profileId = await ctx.db.insert("profiles", {
      userId,
      role: args.role,
      name,
      phone,
      status: "active",
      createdAt: Date.now(),
    });

    if (args.role === "rider") {
      // A real account waits in the Super Admin queue before it can carry
      // passengers — unless the platform switch says otherwise. A guest session
      // is throwaway and nobody is going to sit in that queue for it, so it
      // starts approved and skips the wait entirely.
      //
      // While FETCH is in its testing phase that switch defaults to on, so a
      // newly registered driver can use the dashboard immediately instead of
      // blocking on a queue nobody is working. See `autoApproveRiders`.
      const isGuest = (await getCallerUser(ctx))?.isAnonymous === true;
      const approved = isGuest || (await autoApproveRiders(ctx));
      await ctx.db.insert("riders", {
        userId,
        name,
        phone,
        approval: approved ? "APPROVED" : "PENDING",
        isOnline: false,
        vehicle: { make: "—", model: "—", plate: "—", color: "—" },
        createdAt: Date.now(),
      });
    }

    return profileId;
  },
});

/**
 * Does the reserved owner address have a password credential yet?
 *
 * The owner signs in with an email code by default, which creates an
 * `email-otp` account and no password. Until a `password` account exists,
 * `flow: "signIn"` can only ever answer "Invalid credentials" — so the sign-in
 * page uses this to offer password setup instead of a form that cannot work.
 *
 * Reads a fixed, already-public address, so it leaks nothing about anyone else.
 */
export const ownerNeedsPassword = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", RESERVED_ADMIN_EMAIL),
      )
      .unique();
    return existing === null;
  },
});

/**
 * Is the signed-in caller a throwaway guest session?
 *
 * Guests skip the things a real account has to wait for — rider approval above
 * all — because there is no human behind the session to verify or to chase.
 */
export const isGuest = query({
  args: {},
  handler: async (ctx) => isGuestSession(ctx),
});

/**
 * Is the signed-in user the Super Admin?
 *
 * True either because they hold the reserved owner address or because their
 * profile carries the admin role.
 *
 * Returns `null` when nobody is signed in, deliberately *not* a
 * `{ false, false }` verdict. A definite answer for "no one" looks identical to
 * a real signed-out result, so the client would treat it as settled and commit
 * to a route before the identity query had refetched for the new session — which
 * sent the owner to the commuter app on sign-in. `null` is unambiguous: it means
 * "ask again once there is an identity".
 */
export const isOwnerOrAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCallerUser(ctx);
    // Nobody signed in: no answer yet, so callers must keep waiting rather than
    // treat it as "definitely not the owner".
    if (!user) return null;

    // A guest session is settled and negative: it is never the owner and never
    // an admin, whatever a past anonymous profile row may claim. Answering this
    // as `null` instead would leave every guest staring at a loading spinner.
    if (user.isAnonymous) return { isAdmin: false, isOwner: false };

    const isOwner = isReservedAdminEmail(user.email ?? null);
    const profile = await getProfile(ctx, user._id);
    return { isAdmin: isOwner || profile?.role === "admin", isOwner };
  },
});

/**
 * Give the reserved owner an admin profile automatically the first time they
 * sign in, so the console can name them and the shell can show the admin nav.
 * Idempotent, and a no-op for anyone who is not the owner. Access itself never
 * depended on this: `requireAdmin` admits the reserved address directly.
 */
export const ensureAdminProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCallerUser(ctx);
    if (!user || user.isAnonymous) return null;
    if (!isReservedAdminEmail(user.email ?? null)) return null;

    const userId = user._id;
    const existing = await getProfile(ctx, userId);
    if (existing?.role === "admin") return existing._id;

    // The reserved address is the Super Admin outright, so the seat is never
    // treated as taken by anyone else. A profile left behind by an earlier
    // riding account is promoted rather than duplicated — that is exactly the
    // shape a stale rider profile takes, and leaving it would strand the owner
    // on the rider approval screen.
    if (existing) {
      await ctx.db.patch(existing._id, { role: "admin" });

      // The owner can never be a rider, so any rider record they accumulated
      // while the ownership check was broken goes too. Left in place it would
      // sit in the admin's own approval queue as a phantom applicant.
      const rider = await getRider(ctx, userId);
      if (rider) await ctx.db.delete(rider._id);

      return existing._id;
    }
    return await ctx.db.insert("profiles", {
      userId,
      role: "admin",
      name: args.name?.trim().slice(0, 80) || "Fetch Bukidnon",
      phone: args.phone?.trim().slice(0, 20) || "—",
      status: "active",
      createdAt: Date.now(),
    });
  },
});
