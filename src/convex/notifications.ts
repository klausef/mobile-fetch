import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .take(50);
    return unread.length;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .take(100);
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});
