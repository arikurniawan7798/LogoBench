import { z } from "zod";

export const DIMENSIONS = ["readability", "originality", "balance", "scalability", "misinterpretation"] as const;

const dimension = z.object({
  score: z.number().int().min(1).max(10),
  reason: z.string().trim().min(1),
});

export const reviewSchema = z.object({
  scores: z.object({
    readability: dimension,
    originality: dimension,
    balance: dimension,
    scalability: dimension,
    // NOTE: for misinterpretation, a HIGHER score means a LOWER risk of the logo being misread.
    misinterpretation: dimension,
  }),
  personality: z.object({
    presence: z.string(),
    attitude: z.string(),
    formality: z.string(),
    style: z.string(),
    tone: z.string(),
    positioning: z.string(),
  }),
  summary: z.string(),
});

export type ReviewResult = z.infer<typeof reviewSchema>;

export const advancedSchema = reviewSchema.extend({
  fixes: z
    .array(z.object({ issue: z.string().trim().min(1), fix: z.string().trim().min(1), priority: z.enum(["high", "medium", "low"]) }))
    .max(12),
  checklist: z.array(z.object({ item: z.string().trim().min(1), done: z.boolean() })).max(15),
  presentationIdeas: z.array(z.string().trim().min(1)).max(8),
});

export type AdvancedReview = z.infer<typeof advancedSchema>;
