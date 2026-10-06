import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { isValidLatLng } from "./lib/geo";

/**
 * Saved places are the commuter side of "book again in one tap": Home, Work,
 * a favourite shop. Kept deliberately small — this is a shortcut list, not an
 * address book.
 */
const MAX_SAVED_PLACES = 8;
const MAX_LABEL_LENGTH = 24;

/** Saved places for the current user, oldest first so "Home" stays on top. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const places = await ctx.db
      .query("savedPlaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return places
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((place) => ({ _id: place._id, label: place.label, ...place.point }));
  },
});

/** Saves a place, or moves the existing pin when the label is already used. */
export const savePlace = mutation({
  args: {
    label: v.string(),
    lat: v.number(),
    lng: v.number(),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const point = {
      lat: args.lat,
      lng: args.lng,
      address: args.address?.trim().slice(0, 120) || undefined,
    };
    if (!isValidLatLng(point)) {
      throw new Error("That location is not valid.");
    }
    const label = args.label.trim().slice(0, MAX_LABEL_LENGTH);
    if (!label) throw new Error("Give this place a name.");

    const existing = await ctx.db
      .query("savedPlaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const match = existing.find(
      (place) => place.label.toLowerCase() === label.toLowerCase(),
    );
    if (match) {
      await ctx.db.patch(match._id, { point });
      return match._id;
    }
    if (existing.length >= MAX_SAVED_PLACES) {
      throw new Error(`You can save up to ${MAX_SAVED_PLACES} places.`);
    }

    return await ctx.db.insert("savedPlaces", {
      userId,
      label,
      point,
      createdAt: Date.now(),
    });
  },
});

export const removePlace = mutation({
  args: { placeId: v.id("savedPlaces") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const place = await ctx.db.get(args.placeId);
    if (!place || place.userId !== userId) {
      throw new Error("Saved place not found.");
    }
    await ctx.db.delete(args.placeId);
  },
});