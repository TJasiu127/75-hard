import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getUploadUrl = mutation({
  args: { contentType: v.string() },
  handler: async (ctx) => {
    const url = await ctx.storage.generateUploadUrl();
    return { url };
  }
});

export const getUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  }
});
