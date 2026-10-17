import { expect, test } from "bun:test";
import { parseRoute, routeHash } from "../src/client/state/route.ts";

test("pages round-trip through the address bar", () => {
  for (const route of [
    { page: "soon" },
    { page: "timeline" },
    { page: "routines" },
    { page: "archive" },
    { page: "settings", settings: "changelog" },
    { page: "settings", settings: "games", game: "genshin" },
  ] as const)
    expect(parseRoute(routeHash(route))).toEqual(route);
  expect(routeHash({ page: "soon" })).toBe("#checklist");
  expect(routeHash({ page: "settings", settings: "about" })).toBe(
    "#settings/about",
  );
});

test("an unknown or empty hash is no route, so the default view applies", () => {
  for (const hash of [
    "",
    "#",
    "#nowhere",
    "#settings/nope",
    "#settings/games/",
  ])
    expect(parseRoute(hash)).toBeNull();
  // A settings hash without a section opens the default section.
  expect(parseRoute("#settings")).toEqual({
    page: "settings",
    settings: "appearance",
  });
});

test("the old Default view address opens Appearance, where it moved", () => {
  expect(parseRoute("#settings/general")).toEqual({
    page: "settings",
    settings: "appearance",
  });
});

test("the old Lists address opens Data & sources, where its options moved", () => {
  expect(parseRoute("#settings/lists")).toEqual({
    page: "settings",
    settings: "sources",
  });
});

test("the games address without a game opens Appearance, where game order lives", () => {
  expect(parseRoute("#settings/games")).toEqual({
    page: "settings",
    settings: "appearance",
  });
});
