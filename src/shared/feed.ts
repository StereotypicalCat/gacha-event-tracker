import { z } from "zod";
import { GachaEvent, GameId } from "./schema.ts";

/**
 * The wire contract between server and client.
 *
 * The client refuses a `schemaVersion` it does not know rather than guessing at
 * unfamiliar fields. Additive fields do not bump it; removing or retyping one
 * does. See docs/DATA-MODEL.md § Schema versioning.
 */
export const SCHEMA_VERSION = 1;

export const SourceHealth = z.object({
  sourceId: z.string(),
  game: GameId,
  url: z.string().url(),
  lastSuccessAt: z.string().datetime().nullable(),
  eventCount: z.number().int().nonnegative(),
});

export const EventFeed = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  events: z.array(GachaEvent),
  sources: z.array(SourceHealth),
});

export type SourceHealth = z.infer<typeof SourceHealth>;
export type EventFeed = z.infer<typeof EventFeed>;
