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

  /**
   * True when the document is one this parser understands *and* the document
   * itself says it currently lists no events.
   *
   * Optional, and absent for every parser whose pages do not say so. It exists
   * because `canParse` and a row count cannot together tell a source that broke
   * from a game that is simply between versions: both yield nothing. A page
   * that states its own emptiness can, and the refresh runner stores that as a
   * real answer instead of counting it as a failure — see
   * `scripts/refresh-sources.ts` § the parse gate. Anything less explicit than
   * the page's own words belongs on the strict side of that gate.
   */
  statesNoEvents?(html: string): boolean;

  parse(html: string, ctx: ParseContext): GachaEvent[];
}
