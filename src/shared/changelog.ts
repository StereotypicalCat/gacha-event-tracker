import { z } from "zod";

/**
 * What changed, for the reader (PRD F18).
 *
 * Two tiers, both tied to git. **Entries** are one line each, shown as *What's
 * new* after a new version loads; each names the commit it shipped in.
 * **Notes** are a few paragraphs per feature or milestone, summarised from the
 * history and the specs; each names the range it covers and the specs it
 * draws on, and the footer's changelog lists them.
 *
 * Written by a person or an agent at development time, in the reader's words —
 * never generated at runtime (AGENTS.md constraint 2). It ships in the bundle,
 * so it works offline and always describes the version that carries it.
 *
 * Refs are abbreviated commits. Tests check their shape; whether they exist is
 * `scripts/check-changelog.ts`'s question, because CI checks out shallowly.
 */

const Ref = z.string().regex(/^[0-9a-f]{7,40}$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Id = z.string().regex(/^[a-z0-9-]{3,60}$/);

export const EntrySchema = z.object({
  id: Id,
  date: Day,
  kind: z.enum(["feature", "fix", "games"]),
  title: z.string().min(1).max(90),
  body: z.string().max(280).optional(),
  ref: Ref,
  note: z.string().optional(),
});
export type Entry = z.infer<typeof EntrySchema>;

export const NoteSchema = z.object({
  id: Id,
  date: Day,
  title: z.string().min(1).max(90),
  summary: z.array(z.string().min(1)).min(1).max(6),
  from: Ref,
  to: Ref,
  specs: z.array(z.string()).default([]),
});
export type Note = z.input<typeof NoteSchema>;

export const KIND_LABEL: Record<Entry["kind"], string> = {
  feature: "New",
  fix: "Fixed",
  games: "Games & sources",
};

export const ENTRIES: Entry[] = [
  {
    id: "game-tab-kept",
    date: "2026-10-20",
    kind: "feature",
    title: "Switching games keeps your tab",
    body: "In Settings, moving from one game to another now stays on the tab you had open, so going from Genshin's codes to Zenless Zone Zero shows its codes too.",
    ref: "83a2557",
  },
  {
    id: "codes-confirmed-dead",
    date: "2026-10-20",
    kind: "fix",
    title: "Codes that no longer work are marked expired",
    body: "Some codes stop working while guides still list them. Once we've tried one in game and it fails, its Codes tab shows it expired, with the date it was checked.",
    ref: "b8e8d44",
  },
  {
    id: "celebrations",
    date: "2026-10-18",
    kind: "fix",
    title: "Fireworks for every daily, routine and event you finish",
    body: "Ticking a single daily or routine, or completing an event, sets off fireworks again. Finishing all your dailies or a game's routines gets the big celebration. Turn them all off in Settings → Appearance → Celebrations.",
    ref: "f17b798",
  },
  {
    id: "tour-walkthrough",
    date: "2026-10-18",
    kind: "feature",
    title: "A fuller tour, from getting around to finding your codes",
    body: "The tour now starts with a welcome, shows the bar along the top, and walks you to a game's codes step by step. It ends by showing where to replay it. Replaying it from Settings looks the same as the first time.",
    ref: "874d862",
  },
  {
    id: "codes-used-section",
    date: "2026-10-18",
    kind: "feature",
    title: "Used codes move out of the way, and new ones are marked",
    body: "Codes you've redeemed, and codes that have expired, are greyed out in their own section below the ones still to use. In Settings, each game you follow shows how many new codes it has until you open its Codes tab.",
    ref: "3b29010",
  },
  {
    id: "tour-highlights",
    date: "2026-10-18",
    kind: "feature",
    title: "The tour points at what it describes",
    body: "Each step of the tour now highlights the part of the page it's about. The layout and Timeline steps make room for the page, and ask you to try both looks before you go on.",
    ref: "5be04a7",
  },
  {
    id: "safer-saves-backups",
    date: "2026-10-18",
    kind: "fix",
    title: "Safer saving with several tabs open, and backups that leave room",
    body: "Opening Event Clock in a second tab can no longer overwrite what you just saved in another. Automatic backups now stay within a size limit, so they can't crowd out your saved progress.",
    ref: "94fba4d",
  },
  {
    id: "tour-try-layouts",
    date: "2026-10-18",
    kind: "feature",
    title: "A quick tour for everyone, where you pick your layout",
    body: "Everyone takes the short tour once. Along the way you can try Relaxed and Structured, and the new and classic Timeline, on your own events, and keep the one you like. Returning readers start on Relaxed.",
    ref: "d8ce442",
  },
  {
    id: "codes-more-games",
    date: "2026-10-18",
    kind: "games",
    title: "Redeem codes for eight more games, with where to redeem them",
    body: "Star Rail, ZZZ, Wuthering Waves, Endfield, NTE, P5X, Chaos Zero Nightmare and Umamusume now list current codes. Each game's Codes tab links the official redeem page where there is one, or says where to redeem in game.",
    ref: "254e78f",
  },
  {
    id: "redesign",
    date: "2026-10-18",
    kind: "feature",
    title: "A new look for Event Clock",
    body: "Checklist, Timeline, Routines and Archive are redesigned, with Structured and Relaxed layouts. Your games, ticks and settings carried over; the quick tour shows what moved.",
    ref: "50c6e91",
    note: "redesign",
  },
  {
    id: "pass-windows",
    date: "2026-10-16",
    kind: "games",
    title: "Battle pass windows for Star Rail, ZZZ and Infinity Nikki",
    body: "Nameless Honor, the New Eridu City Fund and Mira Journey now appear as events, so you can see when each pass ends before its rewards go.",
    ref: "ec66967",
    note: "pass-windows",
  },
  {
    id: "cycle-built-ins",
    date: "2026-10-16",
    kind: "games",
    title: "Endgame modes on their own cycles for Star Rail, ZZZ, Wuthering Waves and NTE",
    body: "Pure Fiction, Memory of Chaos, Apocalyptic Shadow, Shiyu Defense, Deadly Assault, Tower of Adversity, Beyond the Rails and the Tycoon Incentive Fund, each showing the days left in its cycle. Star Rail's shared Divergent Universe points are weekly.",
    ref: "524b6f2",
    note: "cycle-routines",
  },
  {
    id: "cycle-tasks",
    date: "2026-10-16",
    kind: "feature",
    title: "Set up a task that repeats every so many days",
    body: "Add a task now offers Every N days, from a day a cycle began, for a two-week endgame mode, say. Cycles sit under the dailies with the weekly and monthly tasks, and have their own switch.",
    ref: "be3c140",
    note: "cycle-routines",
  },
  {
    id: "nte-europe-reset",
    date: "2026-10-16",
    kind: "fix",
    title: "Neverness to Everness's Europe day rolls at the game's own reset",
    body: "It rolled an hour late, at 06:00 Copenhagen time in summer rather than 05:00. Ticks you logged in that hour now count for the day the game gave them.",
    ref: "9d5b473",
  },
  {
    id: "standard-pulls",
    date: "2026-10-16",
    kind: "feature",
    title: "Choose premium pulls only, or standard-banner pulls too",
    body: "Shops that sell gacha pulls are tracked by their premium line. Include standard-banner pulls, under the built-in tasks switch, adds the standard line beside it.",
    ref: "af2ad94",
    note: "built-in-routines",
  },
  {
    id: "ridu-weekly-2100",
    date: "2026-10-16",
    kind: "fix",
    title: "ZZZ's Ridu Weekly counts to 2,100 points, not 1,300",
    body: "The cap rose in January and our source had not caught up. A week you logged at 1,300 now reads 1,300 of 2,100.",
    ref: "387fc1d",
  },
  {
    id: "built-ins-seven-games",
    date: "2026-10-16",
    kind: "games",
    title: "Built-in weekly and monthly tasks for seven games",
    body: "Genshin, Star Rail, ZZZ, Endfield, Wuthering Waves, NTE and Infinity Nikki: weekly bosses, battle pass EXP caps, monthly shops and more, each from a dated source.",
    ref: "9cf7649",
    note: "built-in-routines",
  },
  {
    id: "stop-tracking-one",
    date: "2026-10-16",
    kind: "feature",
    title: "Track or stop tracking any single item in the strip",
    body: "The strip's Edit panel now lists each game's daily chore and built-in tasks beside its events. Stop tracking one, such as a shop you never buy from, and the rest stay.",
    ref: "3fd2b3c",
    note: "built-in-routines",
  },
  {
    id: "genshin-duplicates",
    date: "2026-10-14",
    kind: "fix",
    title: "Genshin's battle pass and anniversary selectors are listed once, not twice",
    body: "Our two Genshin sources name these differently, and each showed up twice. Anything you ticked, noted or hid on the extra row now sits on the one that stays.",
    ref: "16c277b",
    note: "genshin-duplicates",
  },
  {
    id: "form-examples",
    date: "2026-10-14",
    kind: "feature",
    title: "Start an event or a task of your own from an example",
    body: "Add an event and Add a task open with examples such as a banner with a known end or a weekly points target. You fill in the name, dates and numbers, and Save says what it still needs.",
    ref: "6c66b81",
  },
  {
    id: "per-game-switches",
    date: "2026-10-14",
    kind: "feature",
    title: "Turn daily chores and built-in weekly tasks on or off per game",
    body: "In Settings, under What you see, each has one switch for every game and Choose games for the ones that differ.",
    ref: "a39c6a8",
    note: "per-game-switches",
  },
  {
    id: "edit-dailies-in-place",
    date: "2026-10-14",
    kind: "feature",
    title: "Edit Today's dailies in place, with weekly and monthly tasks in a row below",
    body: "Edit, beside Catch up, adds a running event to the strip and sets its check-in goal without opening it. Weekly and monthly tasks sit under the dailies, and each can be switched off.",
    ref: "9477ac5",
  },
  {
    id: "upcoming-shown-to-new-readers",
    date: "2026-10-13",
    kind: "feature",
    title: "New readers start with upcoming events shown",
    body: "Events that haven't started yet are on for anyone setting the app up for the first time. If you already use it, your setting is unchanged; it's under What you see.",
    ref: "5297b8e",
  },
  {
    id: "changelog",
    date: "2026-10-13",
    kind: "feature",
    title: "What's new after an update, and a changelog in the footer",
    body: "A short list of changes appears once after a new version loads. The footer's Changelog has the fuller story: notes summarised from the project's history, each linked to its commits.",
    ref: "65505e1",
  },
  {
    id: "check-for-new-data",
    date: "2026-10-13",
    kind: "feature",
    title: "Check for new data, beside the data's age in the footer",
    body: "A reload can show the browser's saved copy for a few minutes. The button asks the server directly and says what came back. It can't make the sources be read sooner; they refresh about twice a day.",
    ref: "f7ba86e",
  },
  {
    id: "built-in-weekly-tasks",
    date: "2026-10-13",
    kind: "feature",
    title: "Built-in weekly tasks for Zenless Zone Zero and Arknights: Endfield",
    body: "Ridu Weekly (1,300 points) and the Weekly Routine (10 points), each dated by the page it comes from. You're asked once per game; Make it mine copies one into your own tasks to edit.",
    ref: "624c725",
    note: "weekly-and-monthly-tasks",
  },
  // 2026-10-13 — weekly and monthly tasks
  {
    id: "weekly-and-monthly-tasks",
    date: "2026-10-13",
    kind: "feature",
    title: "Weekly and monthly tasks, beside each game's dailies",
    body: "Add your own in Settings, under Your own: tick it off a set number of days, or enter a number against a target, like 1900 / 2100. Each task is counted by its own week or month, and your backup includes it.",
    ref: "1edce31",
    note: "weekly-and-monthly-tasks",
  },
  {
    id: "event-goal-in-points",
    date: "2026-10-13",
    kind: "feature",
    title: "An event's goal can be a number of points, not only days",
    body: "In the event's sheet, choose Points and set a target each week or across the event. Enter where you are now, and it is kept for that period.",
    ref: "d0b295c",
    note: "weekly-and-monthly-tasks",
  },
  // 2026-10-13 — check-in goals
  {
    id: "check-in-goals",
    date: "2026-10-13",
    kind: "feature",
    title: "Check-in goals: five days of seven, or a number across the whole event",
    body: "Set a goal from an event's checklist. It stays in Today's dailies with its count on the chip, and reads as done this week once the week is met. Meeting a goal never marks the event done; you do that.",
    ref: "3c668ab",
    note: "check-in-goals",
  },
  // 2026-10-13 — per-server reset clocks
  {
    id: "reset-hololive-dreams",
    date: "2026-10-13",
    kind: "games",
    title: "hololive Dreams' day now rolls at 05:00 JST, not 04:00",
    body: "The old hour was read off a single mission. Some days you already ticked may now show under the neighbouring day.",
    ref: "6c870b2",
    note: "per-server-reset-clocks",
  },
  {
    id: "reset-reverse-1999-asia",
    date: "2026-10-13",
    kind: "games",
    title: "Reverse: 1999 readers in Asia now follow the Asia server's clock",
    body: "The Asia server resets at 05:00 UTC+8. Asia readers were on the Global server's clock, thirteen hours later.",
    ref: "ad159c5",
    note: "per-server-reset-clocks",
  },
  {
    id: "reset-girls-frontline-2",
    date: "2026-10-13",
    kind: "games",
    title: "Girls' Frontline 2 now follows its Asia and Global server clocks",
    body: "Asia resets at 05:00 UTC+8; America and Europe take the Global server, at 21:00 UTC-8.",
    ref: "aadd571",
    note: "per-server-reset-clocks",
  },
  {
    id: "reset-neverness-to-everness",
    date: "2026-10-13",
    kind: "games",
    title: "Neverness to Everness's day now rolls at 05:00, with America on UTC-4",
    body: "Asia and Europe were rolling an hour early. America's reset lands where it did before.",
    ref: "ccc4eb6",
    note: "per-server-reset-clocks",
  },
  {
    id: "reset-single-server-games",
    date: "2026-10-13",
    kind: "games",
    title: "Six games with one worldwide server now reset when that server does",
    body: "Blue Archive, Umamusume, Chaos Zero Nightmare, P5X, Punishing: Gray Raven and Stella Sora were on a regional default. Each now rolls its day at its server's own reset, the same for every region.",
    ref: "93bde74",
    note: "per-server-reset-clocks",
  },
  {
    id: "reset-infinity-nikki",
    date: "2026-10-13",
    kind: "games",
    title: "Infinity Nikki's America and Europe servers now have their own clocks",
    body: "Both reset at 04:00 server time. The day was rolling two hours early for America and an hour late for Europe.",
    ref: "32e252e",
    note: "per-server-reset-clocks",
  },
  // 2026-10-01
  {
    id: "timeline-bar-names-visible",
    date: "2026-10-01",
    kind: "fix",
    title: "A timeline bar ending today shows the start of its name, not the tail",
    body: "Names now shorten at their end to fit the part of the bar on screen.",
    ref: "adec971",
  },
  {
    id: "meter-keeps-last-tick",
    date: "2026-10-01",
    kind: "fix",
    title: "An event in its last hour no longer looks finished",
    body: "The meter keeps one lit tick while an event is still running, so the most urgent rows read as urgent.",
    ref: "21a0460",
  },
  {
    id: "game-hues-readable-dark",
    date: "2026-10-01",
    kind: "fix",
    title: "Five game colours are lighter on the dark theme so their names can be read",
    body: "Fate/Grand Order's navy was nearly invisible. Only lightness changed; each game keeps its hue.",
    ref: "66d6748",
  },
  // 2026-09
  {
    id: "footer-says-why-data-is-old",
    date: "2026-09-18",
    kind: "feature",
    title: "The footer says whether old data is our fetch or the wiki not updating",
    body: "A breakdown per source shows when each was last checked and when its content last changed.",
    ref: "347d4dd",
  },
  {
    id: "export-import-all",
    date: "2026-09-17",
    kind: "feature",
    title: "Export all and Import all move everything, settings included, to another device",
    ref: "b73c253",
  },
  {
    id: "blue-archive-wiki-redesign",
    date: "2026-09-17",
    kind: "games",
    title: "Blue Archive events are read again after its wiki redesigned the schedule",
    ref: "2bc61e7",
  },
  {
    id: "punishing-gray-raven",
    date: "2026-09-12",
    kind: "games",
    title: "Punishing: Gray Raven added, from karendar.com's Global calendar",
    body: "Its events carry exact times, not just dates.",
    ref: "4382ed3",
  },
  {
    id: "genshin-fandom-source",
    date: "2026-09-12",
    kind: "games",
    title: "Genshin Impact gains a second source, its Fandom wiki",
    body: "It refreshes on the schedule; the Game8 page is refreshed by hand.",
    ref: "81ac9fb",
  },
  // 2026-08-28
  {
    id: "ended-own-events-in-settings",
    date: "2026-08-28",
    kind: "feature",
    title: "Your own events that have ended are listed in Settings, to edit or delete",
    body: "Before, a one-off event you added vanished from every screen the day it ended. Each row says why it isn't on the front page.",
    ref: "f324208",
  },
  {
    id: "switch-off-standing-chores",
    date: "2026-08-28",
    kind: "feature",
    title: "Switch off the standing chores the app lists for each game",
    body: "Events keep their checklists. Your logged days are kept, so switching back on restores every tick and streak.",
    ref: "943e1dd",
  },
  {
    id: "recurring-own-events",
    date: "2026-08-28",
    kind: "feature",
    title: "Your own events can repeat: weekly, monthly, or on a cycle",
    body: "Say how it repeats first, and the form asks only for the dates it needs. A weekly reset needs no end date.",
    ref: "33f7c77",
    note: "recurring-own-events",
  },
  {
    id: "honkai-impact-3rd",
    date: "2026-08-27",
    kind: "games",
    title: "Honkai Impact 3rd added, from arustats.com",
    ref: "c272d9e",
  },
  // 2026-08-20
  {
    id: "import-keeps-newer-progress",
    date: "2026-08-20",
    kind: "fix",
    title: "Importing a backup no longer rolls your progress back to an older copy",
    ref: "f9ef21a",
  },
  {
    id: "game-order",
    date: "2026-08-20",
    kind: "feature",
    title: "Put your games in your own order, from Settings",
    body: "Until you do, games are alphabetical. The focus bar, Today's dailies and the timeline follow the order, and each game's dailies sit together.",
    ref: "74c1f74",
    note: "game-order-and-catch-up",
  },
  {
    id: "catch-up-missed-days",
    date: "2026-08-20",
    kind: "feature",
    title: "Tick a day you missed, up to two weeks back",
    body: "Each game's dailies and events with no announced end now offer the days you may have played but not ticked.",
    ref: "bf7959c",
    note: "game-order-and-catch-up",
  },
  // 2026-08-19
  {
    id: "unstarted-events-switch",
    date: "2026-08-19",
    kind: "feature",
    title: "One switch shows events that haven't started, in both views",
    body: "It is off by default. On the timeline, choose whether unstarted events sit in their own group or mix in by end date.",
    ref: "2cb4dd2",
    note: "timeline-board",
  },
  {
    id: "infinity-nikki-fandom",
    date: "2026-08-19",
    kind: "games",
    title: "Infinity Nikki moves to its Fandom wiki, which is kept up to date",
    body: "The Game8 page had stopped updating a year earlier and was showing old events as live. Dates are shown by day, because the wiki states no timezone.",
    ref: "2985484",
  },
  {
    id: "five-games-2026-08-19",
    date: "2026-08-19",
    kind: "games",
    title: "Girls' Frontline 2, Stella Sora, Chaos Zero Nightmare, Umamusume and Nikke added",
    body: "Each arrives switched off; turn on the ones you play in Settings.",
    ref: "bd38585",
  },
  // 2026-08-18
  {
    id: "light-theme",
    date: "2026-08-18",
    kind: "feature",
    title: "A light theme, or follow your system, from Settings",
    ref: "eca5ad7",
    note: "light-theme",
  },
  {
    id: "timeline-closer-zoom",
    date: "2026-08-18",
    kind: "feature",
    title: "Zoom the timeline in two steps closer than a week",
    body: "Events that end a day apart are now easy to tell apart, and short bars are wide enough to tap.",
    ref: "d491437",
    note: "timeline-board",
  },
  {
    id: "timeline-stack-by-deadline",
    date: "2026-08-18",
    kind: "feature",
    title: "Stack the timeline by deadline, as one queue, instead of by game",
    ref: "663196b",
    note: "timeline-board",
  },
  {
    id: "countdown-to-game-reset",
    date: "2026-08-18",
    kind: "fix",
    title: "Countdowns end at the game's reset on your server, not at UTC midnight",
    body: "When a source gives only a date, the countdown now runs to the reset that opens that day on your server. Most events were affected, by up to nine hours.",
    ref: "4334988",
  },
  {
    id: "fate-grand-order",
    date: "2026-08-18",
    kind: "games",
    title: "Fate/Grand Order added, on the English server's calendar",
    ref: "4698ebc",
  },
  {
    id: "hololive-dreams",
    date: "2026-08-18",
    kind: "games",
    title: "hololive Dreams added, from its own wiki",
    ref: "7ab801f",
  },
  {
    id: "timeline-board",
    date: "2026-08-18",
    kind: "feature",
    title: "The timeline keeps its dates, game names and event names in view as you scroll",
    ref: "e489697",
    note: "timeline-board",
  },
  // 2026-08-17
  {
    id: "five-games-2026-08-17",
    date: "2026-08-17",
    kind: "games",
    title: "Infinity Nikki, P5X, Arknights, Reverse: 1999 and Blue Archive added",
    ref: "d843c7c",
  },
  {
    id: "update-notice",
    date: "2026-08-17",
    kind: "feature",
    title: "The app offers a reload when a newer version is ready",
    body: "With the tab left open, you would otherwise keep the version you first loaded.",
    ref: "a4ab5aa",
  },
  {
    id: "your-own-games-and-events",
    date: "2026-08-17",
    kind: "feature",
    title: "Add your own games, and events the sources missed",
    ref: "c87ea4c",
    note: "your-own-games-and-events",
  },
  // 2026-08-16 / 08-15
  {
    id: "endfield-europe-reset",
    date: "2026-08-16",
    kind: "games",
    title: "Arknights: Endfield's European day now rolls on the server it is played on",
    body: "Europe is served from the Americas server on UTC-5, so its day rolls at 09:00 UTC, not 03:00.",
    ref: "e6e4f70",
  },
  {
    id: "daily-checklists",
    date: "2026-08-15",
    kind: "feature",
    title: "Daily checklists for events that repeat, and for each game's dailies",
    ref: "ccc5d36",
    note: "progress-and-dailies",
  },
  {
    id: "progress-and-effort",
    date: "2026-08-15",
    kind: "feature",
    title: "Mark an event as doing it or done, and note how much work it takes",
    body: "Rows are flagged when the time left no longer covers the effort you recorded.",
    ref: "89df140",
    note: "progress-and-dailies",
  },
  {
    id: "endfield-star-rail-wuwa-zzz",
    date: "2026-08-15",
    kind: "games",
    title: "Honkai: Star Rail, Wuthering Waves, Zenless Zone Zero and Arknights: Endfield added",
    ref: "dd596b5",
  },
  {
    id: "works-offline",
    date: "2026-08-15",
    kind: "feature",
    title: "Works offline, with the events it last downloaded",
    ref: "c633d05",
    note: "first-version",
  },
];

export const NOTES: Note[] = [
  {
    id: "redesign",
    date: "2026-10-18",
    title: "The redesigned Event Clock",
    summary: [
      "Event Clock has a new layout. The Checklist keeps what ends first at the top, with a side column for focusing a game, the next deadline, today's dailies and the routines you pin. The Timeline, Routines and Archive have their own tabs, and Settings gathers appearance, region and time, each game's servers and colours, data sources and backups.",
      "Two layouts share everything: Structured, a compact ruled planner and the default, and Relaxed, with separated panels and more room. Urgency keeps its colours from before, grey to blue to yellow to red, and you can now change them in Appearance.",
      "Routines have a home: follow dailies, weeklies, monthlies and cycles, pin them beside the Checklist or on the Timeline, and tick or count them off. Finishing one, or a whole section, is celebrated. Redeem codes for the games you track appear at the top of the Checklist and in each game's Codes tab.",
      "Your games, ticks, goals and settings moved to a new saved format on first load. The old copy is kept untouched, a recovery copy is written first, and Backup can save your own copies by hand.",
    ],
    from: "ddd9673",
    to: "50c6e91",
    specs: ["docs/superpowers/specs/2026-10-16-ui-redesign-design.md"],
  },
  {
    id: "pass-windows",
    date: "2026-10-16",
    title: "When each battle pass ends",
    summary: [
      "Star Rail's Nameless Honor and ZZZ's New Eridu City Fund now come from the wikis' pass tables, which date every run, so the current pass shows in Next up and on the timeline until it ends.",
      "Infinity Nikki's Mira Journey has no dated page; it takes the version's dates, because its end was checked in the game and matched the version's. The event says so.",
      "Genshin's battle passes were already listed. Endfield's Protocol Pass, Wuthering Waves' Pioneer Podcast and NTE's Circle Bounty wait for a page that dates them.",
    ],
    from: "0a4be4e",
    to: "ec66967",
    specs: ["docs/superpowers/specs/2026-10-16-pass-windows-design.md"],
  },
  {
    id: "cycle-routines",
    date: "2026-10-16",
    title: "Tasks and built-ins on longer cycles",
    summary: [
      "A task can now repeat every so many days from a day a cycle began, not only every week or month. It rolls at the game's daily reset like the others, sits in the row under the dailies, and shows how many days its cycle has left.",
      "Star Rail's three endgame modes, ZZZ's Shiyu Defense and Deadly Assault, Wuthering Waves' Tower of Adversity and NTE's Beyond the Rails and Tycoon Incentive Fund are built in, each from a dated source and anchored on a reset read in the game. The modes are ticked once a cycle; the Fund counts fons against its base cap, and yours may be higher.",
      "Beyond the Rails ends at the same moment on every server, the Asia server's reset, so it rolls then for everyone.",
      "Cycle tasks have their own switch beside the weekly and monthly ones, on unless you turn it off.",
    ],
    from: "a80f581",
    to: "524b6f2",
    specs: ["docs/superpowers/specs/2026-10-16-cycle-routines-design.md"],
  },
  {
    id: "built-in-routines",
    date: "2026-10-16",
    title: "Weekly and monthly tasks for seven games, and tracking them one by one",
    summary: [
      "Seven games now come with their weekly and monthly tasks built in: weekly bosses and point targets, battle pass EXP caps, monthly shop buy-outs and endgame resets. Each one names the page it comes from and the date that page gives. Where no page states a figure, the figure was checked in the game and says so, with the day.",
      "Any single item can be tracked or not, from the strip's Edit panel or from Your own, which lists every built-in of your games so none is ever off with no way back. The Edit panel now holds everything the strip carries, by game: the daily chore, the built-in tasks, then the events.",
      "Shops that sell gacha pulls usually stock both the premium and the standard banner. The premium line is tracked with the rest; Include standard-banner pulls adds the standard one.",
      "Built-ins stay off until you say yes, as before. Nothing you ticked or entered is removed by stopping one.",
    ],
    from: "612e0a2",
    to: "e1e5fc0",
    specs: ["docs/superpowers/specs/2026-10-14-built-in-routines-design.md"],
  },
  {
    id: "genshin-duplicates",
    date: "2026-10-14",
    title: "One row per Genshin event, from two sources",
    summary: [
      "Genshin's calendar is built from two wikis, and they do not always agree on a name. One prints \"Battle Pass - Moontrace\" where the other prints \"Moontrace\"; one calls a selector \"Free Limited 5-Star Anniversary Selector\" where the other uses the event's own name. Each of these was on the calendar twice, and every battle pass since September had been.",
      "Both now appear once. The selectors are paired because one wiki's description names the other's event, which is the same evidence a person would use, so next year's selectors should pair without anyone stepping in. Matching dates alone never pair two events: a new version starts about twenty on the same day.",
      "When two rows become one, anything you ticked, noted or hid on the row that goes is carried to the row that stays, including from an export file made before the change.",
    ],
    from: "7c8fa7f",
    to: "16c277b",
    specs: ["docs/superpowers/specs/2026-10-14-genshin-duplicates-design.md"],
  },
  {
    id: "per-game-switches",
    date: "2026-10-14",
    title: "Daily chores and built-in tasks, per game",
    summary: [
      "Each game's daily chores could only be switched off for every game at once, and built-in weekly tasks had a checkbox per game that grew with every game added. Both now work the same way: one switch for every game, and the games that differ.",
      "Under each switch a line says where it stands, such as All but Honkai: Star Rail or Only Zenless Zone Zero. Choose games opens a row of game chips to change it.",
      "Your earlier answers are kept as they were. Built-ins stay off until you say yes, and the strip stops asking about one game once you have answered for all of them. Nothing you ticked or entered is removed by any of these switches.",
    ],
    from: "47c3953",
    to: "094e67d",
    specs: ["docs/superpowers/specs/2026-10-14-per-game-switches-design.md"],
  },
  {
    id: "weekly-and-monthly-tasks",
    date: "2026-10-13",
    title: "Weekly and monthly tasks, with numeric targets",
    summary: [
      "Some chores roll weekly or monthly rather than daily: earning a week's activity points in Zenless Zone Zero, finishing Endfield's weekly routine. You can now set these up per game and see them beside that game's dailies.",
      "A task either counts days, ticked like a daily (once is \"done this week\"), or tracks a number against a target, such as 1900 / 2100. A number chip opens a small editor under the strip instead of ticking, and you enter where you are now rather than adding to it.",
      "Each task is counted by its own week or month, cut at the game's reset on your server, so a chore due Sunday is not waiting on you every morning. Weekly and monthly items get their own count beside Today's dailies. Catch up offers last period's days or number, the way it offers yesterday's tick.",
      "Check-in goals on events gain the same numbers: a goal can be points each week or in total, entered in the event's sheet.",
      "Tasks are added, edited and deleted in Settings, under Your own, and travel in your backup. Deleting a task keeps its logged days and numbers.",
      "Some games' weekly tasks are built in: Zenless Zone Zero's Ridu Weekly (1,300 points) and Arknights: Endfield's Weekly Routine (10 points), each from a cited page and dated by it. They are off until you say yes; the strip asks once per game, a switch in Settings governs them after, and Make it mine copies one into your own tasks with its numbers.",
    ],
    from: "e7ee43f",
    to: "1c7df63",
    specs: ["docs/superpowers/specs/2026-10-13-periodic-tasks-design.md"],
  },
  {
    id: "check-in-goals",
    date: "2026-10-13",
    title: "Check-in goals for events",
    summary: [
      "Some events want a number of check-ins rather than every day. Genshin's \"To Temper Thyself and Journey Far\" asks for five days out of seven each week. Until now the app could only show a daily checklist, which called every unticked day missed.",
      "You can now set a goal from an event's checklist: a number of days each week, or a number of days across the whole event. A week starts on the weekday you choose, at the game's reset on your server, and defaults to the weekday the event began.",
      "The event stays in Today's dailies with its count on the chip. Once this week's target is met it reads as done this week and counts toward the heading, without a tick being invented for today.",
      "Meeting a goal never finishes the event. Reaching an event-wide goal offers Mark event done, but only you mark it. Goals are your own input: the sources don't publish these counts, and nothing is guessed from an event's title.",
    ],
    from: "1deb0cb",
    to: "064cea2",
    specs: ["docs/superpowers/specs/2026-10-03-check-in-goals-design.md"],
  },
  {
    id: "per-server-reset-clocks",
    date: "2026-10-13",
    title: "Each game's day now rolls on its own server's clock",
    summary: [
      "Countdowns, dailies and weekly goals all depend on when a game's day rolls over. Many games were on a regional default reset that did not match their own servers.",
      "Every server's reset hour and timezone was checked against Game-Time-Master, which is now credited in the footer. Eleven games were corrected: six with one worldwide server now reset when that server does, and Infinity Nikki, Neverness to Everness, Girls' Frontline 2, Reverse: 1999 and hololive Dreams now follow the right server for your region.",
      "Nothing you logged is lost, but some days you already ticked may now show under the neighbouring day, because the boundary between days has moved.",
    ],
    from: "32e252e",
    to: "84ea00c",
    specs: [],
  },
  {
    id: "recurring-own-events",
    date: "2026-08-28",
    title: "Your own events can repeat",
    summary: [
      "Weekly missions, a boss that reopens every two weeks, a battle pass every version: until now each had to be typed in again every time it came round.",
      "An event you add can now repeat every so many days, weeks or months. The form asks how it repeats first: never, as soon as it ends, or after a wait. Then it asks only for the dates it needs. A weekly reset needs no end date, because the next one opening is its end.",
      "The lists show the running or next occurrence and the one after it; the timeline draws every occurrence in view. Only the rule is stored, and done, ignored and progress marks belong to each occurrence.",
      "Changing when a repeating event starts moves its occurrences, so marks on the old dates no longer match. The form warns you before you save.",
    ],
    from: "98cd950",
    to: "33f7c77",
    specs: ["docs/superpowers/specs/2026-08-27-recurring-events-design.md"],
  },
  {
    id: "game-order-and-catch-up",
    date: "2026-08-20",
    title: "Your game order, grouped dailies, and catching up a missed day",
    summary: [
      "Games used to appear in whatever order the data happened to arrive in, and that order shifted as events came and went. They are now alphabetical until you say otherwise.",
      "In Settings, each game has a drag handle and up and down buttons. The focus bar, Today's dailies, the settings list and the timeline's lanes all follow your order. A game added later lands after the ones you placed. The lists you tap during the day are never draggable, so a misplaced drag can't cost you a tick.",
      "Today's dailies groups each game's items together, so a game's standing chore and its login event sit side by side.",
      "You can tick a day you played but forgot to record, up to fourteen days back, for each game's dailies and for events with no announced end. Days that haven't happened yet can't be ticked.",
    ],
    from: "7b6ee62",
    to: "5ae559d",
    specs: ["docs/superpowers/specs/2026-08-20-game-order-and-daily-catch-up-design.md"],
  },
  {
    id: "timeline-board",
    date: "2026-08-19",
    title: "The timeline becomes a board",
    summary: [
      "Readers named paimon.moe's timeline as the one to match. Ours lost the date axis, game names and event names as soon as you scrolled. Now they stay pinned, and a long bar keeps its name in view.",
      "You can set the scale, now down to two steps closer than a week, so events ending a day apart can be told apart. The timeline can stack by game, one lane each, or by deadline as a single queue, and it remembers your choice.",
      "Events that haven't started are held back by default, in both views, behind one switch. With them shown on the timeline, choose whether they sit in their own group or mix in by end date.",
    ],
    from: "e489697",
    to: "2cb4dd2",
    specs: [],
  },
  {
    id: "light-theme",
    date: "2026-08-18",
    title: "A light theme",
    summary: [
      "Dark stays the default. Settings now offers Dark, Light or System, next to the region, and switching takes effect at once without touching anything you have marked or ticked.",
      "Each game keeps its colour in both themes, so you can still find a game by its hue.",
    ],
    from: "448c709",
    to: "c1cd114",
    specs: [],
  },
  {
    id: "your-own-games-and-events",
    date: "2026-08-17",
    title: "Your own games and events",
    summary: [
      "No list of sources will cover every game someone plays. You can now add a game of your own, with a name and a lane colour, and add events to it, or to a tracked game when a source missed one.",
      "\"I don't know when it ends\" is an answer the form offers, not a blank field. Dates you type are shown as yours and never credited to a source.",
      "Like everything else, your games and events stay in this browser and are included in your backup.",
    ],
    from: "4029885",
    to: "0a25cce",
    specs: [],
  },
  {
    id: "progress-and-dailies",
    date: "2026-08-15",
    title: "Progress, effort and daily checklists",
    summary: [
      "An event can now be untouched, doing it or done, and you can note how much work it is and add a note of your own. A row is flagged as tight when the time left no longer covers the effort you recorded.",
      "Events that repeat daily get a checklist of days, and each game's standing dailies appear in Today's dailies at the top of the page. You can mark an event as daily yourself, or switch off the app's guess.",
      "The checklist can also sort by what you are partway through, not only by what runs out first.",
    ],
    from: "ea71973",
    to: "41f0330",
    specs: [],
  },
  {
    id: "first-version",
    date: "2026-08-15",
    title: "Event Clock's first version",
    summary: [
      "One screen for every game you play, ordered by what runs out next. Live and upcoming events come from community wikis and are shown as a checklist sorted by soonest end, and as a timeline with one lane per game.",
      "On first run you pick the games you play, so the page shows only those. Genshin Impact, Neverness to Everness, Honkai: Star Rail, Wuthering Waves and Zenless Zone Zero were the first games covered.",
      "The app works offline: it keeps the events it last downloaded, and countdowns run off your own clock. Each source is credited, and the app says plainly that it is unofficial.",
    ],
    from: "45ad5b3",
    to: "c633d05",
    specs: [],
  },
];

/** Newest-first entries the reader has not dismissed. */
export function unseen(
  entries: readonly Entry[],
  seenId: string | undefined,
  today: string,
): Entry[] {
  if (seenId === undefined) return launchWindow(entries, today);
  const at = entries.findIndex((e) => e.id === seenId);
  // An id that is gone (an entry renamed) falls back to the launch window
  // rather than replaying the whole history.
  return at === -1 ? launchWindow(entries, today) : entries.slice(0, at);
}

/** The entries of the last `days` days — what an existing reader sees the day this ships. */
export function launchWindow(entries: readonly Entry[], today: string, days = 14): Entry[] {
  const floor = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return entries.filter((e) => e.date > floor);
}

/** The newest entry's id, or undefined for an empty changelog. */
export function newestId(entries: readonly Entry[]): string | undefined {
  return entries[0]?.id;
}

/** Links on the public mirror (Colophon's REPO_URL). */
export const commitUrl = (repo: string, ref: string) => `${repo}/commit/${ref}`;
export const compareUrl = (repo: string, from: string, to: string) =>
  `${repo}/compare/${from}...${to}`;
export const specUrl = (repo: string, path: string) => `${repo}/blob/main/${path}`;
