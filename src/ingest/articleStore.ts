import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseArticleEnd, type StatedEnd } from "./articleEnds.ts";
import { hashBody, writeAtomic } from "./snapshots.ts";

/**
 * Stored lead sections of Genshin event articles, under the snapshot root.
 *
 * Tracked like every other snapshot, so re-parsing never re-fetches and a moved
 * end time is a reviewable diff. There is no `.state.json`: an article's read
 * history lives in its metadata, because the due rule has to survive a fresh
 * checkout and a failed read here is never a source's failure streak.
 */
export interface ArticleMeta {
  title: string;
  lastAttemptAt: string;
  /** The last read that worked. A failed attempt never moves this. */
  lastReadAt: string | null;
  statesTime: boolean;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Titles hold `/`, `:` and `'`. The hash keeps two titles that flatten alike apart.
 */
export function articleFileName(title: string): string {
  return `${title.replace(/[^A-Za-z0-9._-]/g, "_")}-${hashBody(title).slice(0, 8)}`;
}

/** Spec decision 6: wiki editors correct these, so a kept time still gets re-read. */
export function articleDue(meta: ArticleMeta | null, nowMs: number): boolean {
  if (meta === null) return true;
  if (nowMs - Date.parse(meta.lastAttemptAt) < SIX_HOURS_MS) return false;
  if (!meta.statesTime || meta.lastReadAt === null) return true;
  return nowMs - Date.parse(meta.lastReadAt) >= SEVEN_DAYS_MS;
}

export class ArticleStore {
  private readonly dir: string;

  constructor(root: string) {
    this.dir = join(root, "articles", "genshin-fandom");
  }

  private bodyPath(title: string): string {
    return join(this.dir, `${articleFileName(title)}.html`);
  }

  private metaPath(title: string): string {
    return join(this.dir, `${articleFileName(title)}.meta.json`);
  }

  private async writeMeta(meta: ArticleMeta): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeAtomic(this.metaPath(meta.title), `${JSON.stringify(meta, null, 2)}\n`);
  }

  async readMeta(title: string): Promise<ArticleMeta | null> {
    const file = Bun.file(this.metaPath(title));
    return (await file.exists()) ? ((await file.json()) as ArticleMeta) : null;
  }

  async readBody(title: string): Promise<string | null> {
    const file = Bun.file(this.bodyPath(title));
    return (await file.exists()) ? await file.text() : null;
  }

  /** A read that worked. Body before metadata. True when the stored bytes moved. */
  async saveRead(title: string, body: string, at: string): Promise<boolean> {
    const changed = (await this.readBody(title)) !== body;
    await mkdir(this.dir, { recursive: true });
    if (changed) await writeAtomic(this.bodyPath(title), body);
    await this.writeMeta({
      title,
      lastAttemptAt: at,
      lastReadAt: at,
      statesTime: parseArticleEnd(body) !== null,
    });
    return changed;
  }

  /** A request that told us nothing about the article: keep what we hold. */
  async recordAttempt(title: string, at: string): Promise<void> {
    const meta = await this.readMeta(title);
    await this.writeMeta({
      title,
      lastAttemptAt: at,
      lastReadAt: meta?.lastReadAt ?? null,
      statesTime: meta?.statesTime ?? false,
    });
  }

  /**
   * The wiki says the article is gone. The metadata stays while the row is
   * listed, so the 6-hour floor still holds for the retries. True if bytes went.
   */
  async markGone(title: string, at: string): Promise<boolean> {
    const held = (await this.readBody(title)) !== null;
    await rm(this.bodyPath(title), { force: true });
    await this.writeMeta({
      title,
      lastAttemptAt: at,
      lastReadAt: (await this.readMeta(title))?.lastReadAt ?? null,
      statesTime: false,
    });
    return held;
  }

  /** The row left the table. True if bytes went. */
  async remove(title: string): Promise<boolean> {
    const held = (await this.readBody(title)) !== null;
    await rm(this.bodyPath(title), { force: true });
    await rm(this.metaPath(title), { force: true });
    return held;
  }

  /** Every stored title. Empty, not an error, on a checkout with no directory. */
  async listed(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const titles: string[] = [];
    for (const name of names.filter((n) => n.endsWith(".meta.json"))) {
      const meta = (await Bun.file(join(this.dir, name)).json()) as ArticleMeta;
      titles.push(meta.title);
    }
    return titles.sort();
  }

  /** What the feed build reads. An article stating no time contributes nothing. */
  async readEnds(): Promise<Map<string, StatedEnd>> {
    const ends = new Map<string, StatedEnd>();
    for (const title of await this.listed()) {
      const body = await this.readBody(title);
      const end = body === null ? null : parseArticleEnd(body);
      if (end !== null) ends.set(title, end);
    }
    return ends;
  }
}
