/**
 * robots.txt: parsing, matching, and a per-host cache.
 *
 * Sources are community wikis and this project's standing rule is to behave as
 * a guest would (CLAUDE.md § Scraping conduct). That starts with actually
 * reading robots.txt rather than assuming a path is fair game.
 *
 * Parsing is a pure function over text, deliberately separated from fetching,
 * so every matching rule below is unit-testable offline. Only `RobotsCache`
 * touches the network, and it takes its `fetch` by injection.
 *
 * Follows RFC 9309: user-agent groups, Allow/Disallow with `*` and `$`
 * wildcards, longest-match-wins with Allow winning a tie, and `*` as the
 * fallback group used only when no named group matches.
 */

export interface RobotsRule {
  /** true for `Allow:`, false for `Disallow:`. */
  readonly allow: boolean;
  /** The raw path pattern; may contain `*` and a trailing `$`. */
  readonly pattern: string;
}

export interface RobotsGroup {
  /** Lowercased user-agent tokens this group applies to. `*` is the fallback. */
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
  readonly crawlDelaySeconds: number | null;
}

export interface RobotsTxt {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
}

/** A robots.txt that restricts nothing — what an absent file means. */
export const ALLOW_ALL: RobotsTxt = { groups: [], sitemaps: [] };

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface MutableGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

/**
 * Parse robots.txt text.
 *
 * Unknown directives are ignored rather than treated as errors — a file we do
 * not fully understand must still yield the rules we do understand.
 */
export function parseRobots(text: string): RobotsTxt {
  const groups: MutableGroup[] = [];
  const sitemaps: string[] = [];

  let current: MutableGroup | null = null;
  // Consecutive `User-agent:` lines share one group; the first rule line after
  // them closes the agent list, so the next `User-agent:` starts a new group.
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    switch (key) {
      case "user-agent": {
        if (value === "") break;
        if (current === null || !acceptingAgents) {
          current = { agents: [], rules: [], crawlDelaySeconds: null };
          groups.push(current);
          acceptingAgents = true;
        }
        current.agents.push(value.toLowerCase());
        break;
      }
      case "allow":
      case "disallow": {
        if (current === null) break;
        acceptingAgents = false;
        // `Disallow:` with an empty value is the documented way to say
        // "nothing is disallowed", so it must not become a match-everything
        // rule. An empty `Allow:` is equally inert.
        if (value === "") break;
        current.rules.push({ allow: key === "allow", pattern: value });
        break;
      }
      case "crawl-delay": {
        if (current === null) break;
        acceptingAgents = false;
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) {
          current.crawlDelaySeconds = seconds;
        }
        break;
      }
      case "sitemap": {
        if (value !== "") sitemaps.push(value);
        break;
      }
      default:
        break;
    }
  }

  return {
    groups: groups.map((g) => ({
      agents: g.agents,
      rules: g.rules,
      crawlDelaySeconds: g.crawlDelaySeconds,
    })),
    sitemaps,
  };
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

/**
 * The product token of a User-Agent header.
 *
 * `"gacha-event-tracker/1.0 (+https://example.test)"` → `"gacha-event-tracker"`.
 */
export function agentToken(userAgent: string): string {
  const first = userAgent.trim().split(/[\s/]/, 1)[0] ?? "";
  return first.toLowerCase();
}

/**
 * The group that applies to a user agent, with every group naming the same
 * agent merged, as RFC 9309 requires.
 *
 * A named group beats `*` outright: a site that disallows everything for `*`
 * but names us explicitly is telling us we may fetch. Longest agent name wins
 * among several matches, so `googlebot-news` beats `googlebot`.
 */
export function groupFor(
  robots: RobotsTxt,
  userAgent: string,
): RobotsGroup | null {
  const token = agentToken(userAgent);
  const full = userAgent.toLowerCase();

  let bestName: string | null = null;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      if (agent === "*") continue;
      // Match on the product token first (the spec's rule); fall back to a
      // substring of the whole header so a group naming "gptbot" still binds a
      // header of "Mozilla/5.0 (compatible; GPTBot/1.2)". Erring towards
      // matching means erring towards obeying more rules, not fewer.
      const hit =
        token === agent || token.startsWith(agent) || full.includes(agent);
      if (!hit) continue;
      if (bestName === null || agent.length > bestName.length) bestName = agent;
    }
  }

  const name = bestName ?? "*";
  const matching = robots.groups.filter((g) => g.agents.includes(name));
  if (matching.length === 0) return null;

  return {
    agents: [name],
    rules: matching.flatMap((g) => g.rules),
    crawlDelaySeconds:
      matching.reduce<number | null>(
        (acc, g) =>
          g.crawlDelaySeconds === null
            ? acc
            : Math.max(acc ?? 0, g.crawlDelaySeconds),
        null,
      ) ?? null,
  };
}

/** Does a robots path pattern match this path? Supports `*` and a final `$`. */
export function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;

  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  let regex = "";
  for (const char of body) {
    if (char === "*") {
      regex += "[\\s\\S]*";
    } else {
      regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }

  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

/**
 * May `userAgent` fetch `path`?
 *
 * `path` is the request target — pathname plus query string, e.g. `/wiki/Event`.
 * Longest matching pattern wins; a tie goes to Allow; no match means allowed.
 */
export function isAllowed(
  robots: RobotsTxt,
  userAgent: string,
  path: string,
): boolean {
  const group = groupFor(robots, userAgent);
  if (group === null) return true;

  const target = path.startsWith("/") ? path : `/${path}`;

  let bestLength = -1;
  let allowed = true;
  for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, target)) continue;
    const length = rule.pattern.length;
    if (length > bestLength || (length === bestLength && rule.allow)) {
      bestLength = length;
      allowed = rule.allow;
    }
  }

  return allowed;
}

/** The crawl delay this agent should honour, in ms, if the file states one. */
export function crawlDelayMs(
  robots: RobotsTxt,
  userAgent: string,
): number | null {
  const group = groupFor(robots, userAgent);
  if (group === null || group.crawlDelaySeconds === null) return null;
  return Math.round(group.crawlDelaySeconds * 1000);
}

/** The path-and-query a robots rule is matched against. */
export function requestTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export interface RobotsDecision {
  readonly allowed: boolean;
  /** Human-readable why, for the run log. */
  readonly reason: string;
  readonly crawlDelayMs: number | null;
}

export interface RobotsCacheOptions {
  userAgent: string;
  fetchImpl: FetchLike;
  /** How long a parsed robots.txt stays good. Defaults to 24h, per docs. */
  ttlMs?: number;
  now?: () => number;
  timeoutMs?: number;
}

interface CacheEntry {
  robots: RobotsTxt;
  /** False when robots.txt could not be read; the host is then off limits. */
  usable: boolean;
  reason: string;
  at: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One robots.txt fetch per host per run (cached 24h), reused by every source on
 * that host — six Game8 adapters must not mean six robots requests.
 *
 * Fails closed. A 5xx, a timeout or a network error means we do not know what
 * the site permits, and "unknown" is not permission.
 */
export class RobotsCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly ttlMs: number;
  private readonly nowMs: () => number;
  private readonly timeoutMs: number;

  constructor(options: RobotsCacheOptions) {
    this.userAgent = options.userAgent;
    this.fetchImpl = options.fetchImpl;
    this.ttlMs = options.ttlMs ?? DAY_MS;
    this.nowMs = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  /** Number of robots.txt requests made, for tests and the run log. */
  fetches = 0;

  async allows(url: string): Promise<RobotsDecision> {
    const origin = new URL(url).origin;
    const entry = await this.entryFor(origin);

    if (!entry.usable) {
      return { allowed: false, reason: entry.reason, crawlDelayMs: null };
    }

    const allowed = isAllowed(entry.robots, this.userAgent, requestTarget(url));
    return {
      allowed,
      reason: allowed ? entry.reason : `disallowed by ${origin}/robots.txt`,
      crawlDelayMs: crawlDelayMs(entry.robots, this.userAgent),
    };
  }

  private async entryFor(origin: string): Promise<CacheEntry> {
    const cached = this.entries.get(origin);
    if (cached !== undefined && this.nowMs() - cached.at < this.ttlMs) {
      return cached;
    }

    const entry = await this.load(origin);
    this.entries.set(origin, entry);
    return entry;
  }

  private async load(origin: string): Promise<CacheEntry> {
    const at = this.nowMs();
    this.fetches += 1;

    let response: Response;
    try {
      response = await this.fetchImpl(`${origin}/robots.txt`, {
        headers: { "User-Agent": this.userAgent, Accept: "text/plain" },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "follow",
      });
    } catch (error) {
      return {
        robots: ALLOW_ALL,
        usable: false,
        reason: `robots.txt unreachable (${String(error)})`,
        at,
      };
    }

    if (response.status === 404 || response.status === 410) {
      // No robots.txt is the site saying nothing, which means no restrictions.
      return {
        robots: ALLOW_ALL,
        usable: true,
        reason: "no robots.txt",
        at,
      };
    }

    if (response.status >= 400) {
      return {
        robots: ALLOW_ALL,
        usable: false,
        reason: `robots.txt returned ${response.status}`,
        at,
      };
    }

    const text = await response.text();
    return { robots: parseRobots(text), usable: true, reason: "robots.txt ok", at };
  }
}
