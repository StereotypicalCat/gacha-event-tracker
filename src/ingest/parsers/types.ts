import type { GachaEvent } from "../../shared/schema.ts";
import type { ParseContext } from "../adapters/types.ts";

/**
 * A parser understands one *site template* — not one game.
 *
 * The split matters as sources multiply: Game8 publishes calendars for a dozen
 * games with the same markup, so one parser serves all of them. Adding a second
 * site (an official JSON feed, a Fandom wiki) means a new parser here, and the
 * adapters that use it are three lines each.
 *
 * Parsers must be pure over their input: no network, no clock, no randomness.
 * `now` arrives via ParseContext.
 */
export interface SourceParser {
  /** Stable identifier, e.g. "game8". Recorded on runs for diagnostics. */
  id: string;

  /** Human-readable, for the review UI and health output. */
  label: string;

  /**
   * Cheap structural check: does this document look like something this parser
   * can read? Used to fail loudly when a site is redesigned, instead of
   * silently returning zero events.
   */
  canParse(html: string): boolean;

  parse(html: string, ctx: ParseContext): GachaEvent[];
}
