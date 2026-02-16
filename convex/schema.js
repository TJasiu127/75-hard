import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  entries: defineTable({
    date: v.string(),
    taskKey: v.string(),
    completed: v.boolean(),
    description: v.string(),
    imageStorageId: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.string())),
    updatedAt: v.number()
  })
    .index("by_date", ["date"])
    .index("by_date_task", ["date", "taskKey"])
});
