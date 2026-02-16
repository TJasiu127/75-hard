import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("entries")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    const mapped = await Promise.all(
      rows.map(async (row) => {
        let imageUrl = null;
        if (row.imageStorageId) {
          imageUrl = await ctx.storage.getUrl(row.imageStorageId);
        }
        let images = null;
        if (row.imageStorageIds && row.imageStorageIds.length) {
          const urls = await Promise.all(
            row.imageStorageIds.map(async (sid) => ({
              storageId: sid,
              url: await ctx.storage.getUrl(sid)
            }))
          );
          images = urls;
        }
        return {
          date: row.date,
          taskKey: row.taskKey,
          completed: row.completed,
          description: row.description,
          imageStorageId: row.imageStorageId || null,
          imageStorageIds: row.imageStorageIds || null,
          imageUrl,
          images,
          updatedAt: row.updatedAt
        };
      })
    );
    return mapped;
  }
});

export const save = mutation({
  args: {
    date: v.string(),
    taskKey: v.string(),
    completed: v.boolean(),
    description: v.string(),
    imageStorageId: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.string())),
    clearImage: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entries")
      .withIndex("by_date_task", (q) => q.eq("date", args.date).eq("taskKey", args.taskKey))
      .first();
    const payload = {
      date: args.date,
      taskKey: args.taskKey,
      completed: args.completed,
      description: args.description,
      imageStorageId: args.clearImage ? null : (args.imageStorageId ?? existing?.imageStorageId ?? null),
      imageStorageIds: args.clearImage ? [] : (args.imageStorageIds ?? existing?.imageStorageIds ?? []),
      updatedAt: Date.now()
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("entries", payload);
  }
});
