import { z } from "zod";
import { GameId } from "./schema.ts";
import { SourceHealth } from "./feed.ts";
export const RedeemCodeSchema = z.object({
  id: z.string(),
  game: GameId,
  code: z.string().min(1).max(100),
  reward: z.string().max(1000).nullable(),
  expiresAt: z.string().datetime().nullable(),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  firstObservedAt: z.string().datetime(),
  sourceUrl: z.string().url(),
});
export type RedeemCode = z.infer<typeof RedeemCodeSchema>;
export const CodesFeedSchema = z.object({
  schemaVersion: z.literal(1),
  codes: z.array(RedeemCodeSchema),
  sources: z.array(SourceHealth),
});
export type CodesFeed = z.infer<typeof CodesFeedSchema>;
