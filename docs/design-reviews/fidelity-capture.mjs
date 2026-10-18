// Run from the repository root. Puppeteer stays in a scratch installation.
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE);
const APP_URL = process.env.APP_URL || "http://event-clock.test:41907";
const MOCKUP_URL = process.env.MOCKUP_URL || "http://localhost:41901";
import fs from "node:fs/promises";
const out = "docs/design-reviews/assets/2026-10-17-fidelity";
await fs.mkdir(out, { recursive: true });
const base = JSON.parse(
    await fs.readFile("public/data/events.v1.json", "utf8"),
  ),
  events = JSON.parse(
    await fs.readFile(`${out}/reference-events.json`, "utf8"),
  );
const at = "2026-10-16T12:00:00.000Z";
const fixture = {
  ...base,
  events: events.map((e) => ({
    ...base.events[0],
    id: `${e.game}:visual-${e.id}:2026-10-01`,
    game: e.game,
    title: e.title,
    summary: e.desc || null,
    startsAt: new Date(e.start).toISOString(),
    endsAt: e.end ? new Date(e.end).toISOString() : null,
    startPrecision: "exact",
    endPrecision: e.end ? "exact" : "unknown",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: e.src || base.events[0].sourceUrl,
  })),
  sources: base.sources.map((s) => ({
    ...s,
    lastSuccessAt: at,
    lastConfirmedAt: at,
  })),
};
const sampleState = JSON.parse(
  await fs.readFile(`${out}/reference-state.json`, "utf8"),
);
const b = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  args: [
    "--no-sandbox",
    "--no-proxy-server",
    "--host-resolver-rules=MAP event-clock.test 127.0.0.1",
  ],
});
let errors = [];
for (const variant of ["structured", "relaxed"])
  for (const width of [1440, 390])
    for (const theme of ["dark", "light"]) {
      for (const mode of ["reference", "app"]) {
        const ctx = await b.createBrowserContext(),
          p = await ctx.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        await p.setViewport({ width, height: 1000 });
        if (mode === "app") {
          await p.setRequestInterception(true);
          p.on("request", (r) =>
            r.url().endsWith("events.v1.json")
              ? r.respond({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify(fixture),
                })
              : r.continue(),
          );
          await p.evaluateOnNewDocument((at) => {
            const D = Date;
            class FixedDate extends D {
              constructor(...args) {
                super(...(args.length ? args : [at]));
              }
              static now() {
                return D.parse(at);
              }
            }
            window.Date = FixedDate;
            if (!localStorage.getItem("seeded")) {
              localStorage.setItem("seeded", "yes");
              localStorage.setItem(
                "gacha-tracker:v1:prefs",
                JSON.stringify({
                  onboarded: true,
                  knownGames: [
                    "genshin",
                    "hsr",
                    "zzz",
                    "wuwa",
                    "endfield",
                    "nte",
                  ],
                  view: "soon",
                  region: "europe",
                }),
              );
            }
          }, at);
          await p.goto(APP_URL);
          await p.waitForSelector(".app-navigation");
          await p.evaluate(
            ({ variant, theme, sampleState, template, at }) => {
              let s = JSON.parse(
                localStorage.getItem("gacha-tracker:v2:reader"),
              );
              s.prefs.redesignTourSeen = "2026-10-tour-2";
              s.prefs.interface = variant;
              s.prefs.theme = theme;
              s.prefs.changelogSeen = "9999-12-31";
              const genshin = Object.values(s.accounts).find(
                (a) => a.game === "genshin",
              );
              const asia = structuredClone(genshin);
              asia.id = "account:visual-asia";
              asia.region = "asia";
              asia.clocks[0].region = "asia";
              asia.clocks[0].automaticBase.offsetUtc = 8;
              s.accounts[asia.id] = asia;
              s.data[asia.id] = {
                progress: {},
                ignored: {},
                daily: {},
                amounts: {},
              };
              for (const a of Object.values(s.accounts)) {
                a.routines = {};
                a.intent = {
                  events: true,
                  dailies: true,
                  weeklyMonthly: true,
                  cycles: true,
                };
                for (const key of sampleState.followed) {
                  const [id, region = "europe"] = key.split("@");
                  if (!id.includes(`:${a.game}:`) || region !== a.region)
                    continue;
                  const rid = id.endsWith(":daily") ? `dailies:${a.game}` : id;
                  const pin = sampleState.pins[key] || {};
                  a.routines[rid] = {
                    followed: true,
                    checklist: !!pin.c,
                    timeline: !!pin.t,
                  };
                }
                if (
                  (a.game === "genshin" && a.region === "europe") ||
                  a.game === "hsr"
                )
                  s.data[a.id].daily.initial = {
                    [`dailies:${a.game}`]: { days: ["2026-10-16"], at },
                  };
                s.data[a.id].amounts.initial = {
                  "routine:genshin:weekly-bosses": {
                    "2026-10-12": { value: a.region === "asia" ? 3 : 2, at },
                  },
                  "routine:hsr:points": { "2026-10-12": { value: 11000, at } },
                };
              }
              for (const r of sampleState.archive) {
                const a = Object.values(s.accounts).find(
                  (a) => a.game === r.game && a.region === "europe",
                );
                if (!a) continue;
                const event = {
                  ...template,
                  id: `${r.game}:archive-${r.id}:${r.start}`,
                  game: r.game,
                  title: r.title,
                  summary: r.desc || null,
                  startsAt: new Date(r.start).toISOString(),
                  endsAt: new Date(r.end).toISOString(),
                  startPrecision: "day",
                  endPrecision: "day",
                  sourceUrl: r.src || template.sourceUrl,
                };
                const key = JSON.stringify([a.id, event.id]);
                s.archive[key] = {
                  accountId: a.id,
                  event,
                  outcome: r.status === "expired" ? "unfinished" : r.status,
                  outcomeAt: new Date(r.at).toISOString(),
                  resolvedEnd: Date.parse(r.end),
                  clockRevision: "initial",
                  progress: { note: "Saved note from this event." },
                  days: r.prog.days.map((d) =>
                    new Date(Date.parse(r.start) + d * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  ),
                  amounts:
                    r.prog.t === "amount"
                      ? { [r.start]: { value: r.prog.got, at } }
                      : {},
                };
              }
              localStorage.setItem(
                "gacha-tracker:v2:reader",
                JSON.stringify(s),
              );
            },
            { variant, theme, sampleState, template: fixture.events[0], at },
          );
          await p.reload();
          await p.waitForSelector(".event-entry");
          await p.evaluate(() => {
            for (const e of document.querySelectorAll(
              ".updates-panel,.release-update",
            ))
              e.style.display = "none";
          });
        } else {
          await p.goto(
            `${MOCKUP_URL}/${variant === "structured" ? "round6/b-rail.html" : "round7/converged.html"}`,
          );
          await p.evaluate((theme) => {
            S.theme = theme;
            S.sourceScenario = "current";
            S.wnSeen = true;
            S.codeSeen = CODE_DEMO.map((c) => c.code);
            render();
          }, theme);
          await p.addStyleTag({
            content:
              "#chrome{display:none}body{padding-top:0}.rail{top:0!important;max-height:100vh!important}.source-status-label{display:none}",
          });
        }
        await p.evaluate(() => document.fonts.ready);
        await p.screenshot({
          path: `${out}/${mode}-${variant}-${theme}-${width}.png`,
        });
        if (
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          errors.push(`${mode} ${variant} ${width} ${theme} overflow`);
        if (theme === "dark") {
          for (const page of ["routines", "archive", "timeline", "settings"]) {
            await p.evaluate(
              ({ page, mode }) => {
                if (mode === "reference") {
                  S.tab = page;
                  if (page === "settings") S.sel = "genshin";
                  render();
                } else {
                  [...document.querySelectorAll(".app-navigation button")]
                    .find((e) => e.textContent.toLowerCase().startsWith(page))
                    .click();
                }
              },
              { page, mode },
            );
            await new Promise((r) => setTimeout(r, 100));
            if (page === "settings" && mode === "app") {
              await p.evaluate(() =>
                [...document.querySelectorAll(".settings-row")]
                  .find((e) => e.textContent.startsWith("Genshin Impact"))
                  .click(),
              );
              await new Promise((r) => setTimeout(r, 100));
            }
            await p.screenshot({
              path: `${out}/${mode}-${variant}-${page}${width === 1440 ? "" : "-mobile"}.png`,
            });
          }
          if (mode === "app") {
            const nav = async (name) => {
              await p.evaluate(
                (name) =>
                  [...document.querySelectorAll(".app-navigation button")]
                    .find((e) => e.textContent.startsWith(name))
                    .click(),
                name,
              );
              await new Promise((r) => setTimeout(r, 120));
            };
            await nav("Archive");
            await p.click(".archive-open");
            await p.waitForSelector("dialog[open]");
            await p.screenshot({
              path: `${out}/app-${variant}-archive-detail-${width}.png`,
            });
            await p.keyboard.press("Escape");
            await p.evaluate(() =>
              [...document.querySelectorAll("button")]
                .find((e) => e.textContent === "History timeline")
                .click(),
            );
            await p.screenshot({
              path: `${out}/app-${variant}-archive-history-${width}.png`,
            });
            await nav("Routines");
            await p.evaluate(() =>
              [...document.querySelectorAll("button")]
                .find((e) => e.textContent === "Create your own routine")
                .click(),
            );
            await p.waitForSelector("dialog[open]");
            await p.screenshot({
              path: `${out}/app-${variant}-routine-editor-${width}.png`,
            });
            await p.keyboard.press("Escape");
            await nav("Settings");
            for (const label of [
              "Appearance",
              "Default view",
              "Your own events and games",
              "Region & time",
              "Backup",
              "About Event Clock",
              "Changelog",
            ]) {
              await p.evaluate(
                (label) =>
                  [...document.querySelectorAll(".settings-row")]
                    .find(
                      (e) =>
                        e.querySelector(".settings-copy > span")
                          ?.textContent === label,
                    )
                    .click(),
                label,
              );
              await new Promise((r) => setTimeout(r, 100));
              await p.screenshot({
                path: `${out}/app-${variant}-settings-${label.replaceAll(" ", "-")}-${width}.png`,
              });
            }
            await nav("Checklist");
            await p.evaluate(() =>
              [...document.querySelectorAll("button")]
                .find((e) => e.textContent === "Compact")
                .click(),
            );
            await p.screenshot({
              path: `${out}/app-${variant}-compact-${width}.png`,
            });
            await p.click(".event-entry");
            await p.screenshot({
              path: `${out}/app-${variant}-event-detail-${width}.png`,
            });
            await p.keyboard.press("Escape");
          }
        }
        await ctx.close();
      }
    }
console.log(JSON.stringify(errors));
await b.close();
