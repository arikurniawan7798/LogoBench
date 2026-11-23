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
