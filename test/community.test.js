import { describe, it, expect } from "vitest";
import {
  community,
  getNextCommunityCall,
  getTzParts,
  nextEventOccurrence,
  resolveEventUrl,
  resolveLinkKey,
} from "../src/community.js";

const TZ = "America/Argentina/Buenos_Aires";

/** Build a UTC Date for a wall-clock instant in ARG (UTC-3, no DST). */
function argLocal(year, month, day, hour, minute = 0, second = 0) {
  // ARG = UTC-3 → UTC = local + 3h
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second));
}

const mondayEvent = {
  weekday: "lunes",
  time: "17:00",
  timezone: TZ,
};

const wednesdayEvent = {
  weekday: "miércoles",
  time: "17:00",
  timezone: TZ,
};

describe("resolveLinkKey / resolveEventUrl", () => {
  it("resolves canonical keys and aliases", () => {
    expect(resolveLinkKey("discord")).toBe("discord");
    expect(resolveLinkKey("x")).toBe("twitter");
    expect(resolveLinkKey("gh")).toBe("github");
    expect(resolveLinkKey("wa")).toBe("whatsapp");
    expect(resolveLinkKey("site")).toBe("web");
  });

  it("unknown / empty → null (negative)", () => {
    expect(resolveLinkKey("")).toBeNull();
    expect(resolveLinkKey(null)).toBeNull();
    expect(resolveLinkKey("myspace")).toBeNull();
  });

  it("resolveEventUrl prefers discordEventUrl then url then channel", () => {
    expect(
      resolveEventUrl({
        discordEventUrl: "https://example.com/event",
        url: "https://example.com/fallback",
      })
    ).toBe("https://example.com/event");
    expect(resolveEventUrl({ url: "https://example.com/only" })).toBe(
      "https://example.com/only"
    );
    expect(resolveEventUrl({})).toBe(community.discord.eventsChannelUrl);
  });
});

describe("getTzParts", () => {
  it("returns ARG wall parts for a known UTC instant", () => {
    // 2026-03-09 20:00 UTC = 17:00 ARG Monday
    const d = new Date(Date.UTC(2026, 2, 9, 20, 0, 0));
    const p = getTzParts(d, TZ);
    expect(p.year).toBe(2026);
    expect(p.month).toBe(3);
    expect(p.day).toBe(9);
    expect(p.hour).toBe(17);
    expect(p.minute).toBe(0);
    expect(p.weekday).toBe(1); // Monday
  });
});

describe("nextEventOccurrence (injected clock — no real now flake)", () => {
  it("just before call time → same day occurrence", () => {
    // Monday 16:59 ARG → next Monday 17:00 same day
    const now = argLocal(2026, 3, 9, 16, 59, 0);
    const at = nextEventOccurrence(mondayEvent, now);
    expect(at.toISOString()).toBe(argLocal(2026, 3, 9, 17, 0, 0).toISOString());
  });

  it("exact call time still counts as current/next (boundary)", () => {
    const now = argLocal(2026, 3, 9, 17, 0, 0);
    const at = nextEventOccurrence(mondayEvent, now);
    expect(at.toISOString()).toBe(now.toISOString());
  });

  it("just after call time → jump one week", () => {
    // Monday 17:00:01 ARG → next Monday
    const now = argLocal(2026, 3, 9, 17, 0, 1);
    const at = nextEventOccurrence(mondayEvent, now);
    expect(at.toISOString()).toBe(argLocal(2026, 3, 16, 17, 0, 0).toISOString());
  });

  it("weekend → next monday", () => {
    // Saturday 12:00 ARG 2026-03-07 → Monday 2026-03-09 17:00
    const sat = argLocal(2026, 3, 7, 12, 0, 0);
    const atMon = nextEventOccurrence(mondayEvent, sat);
    expect(atMon.toISOString()).toBe(
      argLocal(2026, 3, 9, 17, 0, 0).toISOString()
    );

    // Sunday → same Monday
    const sun = argLocal(2026, 3, 8, 10, 0, 0);
    const atMon2 = nextEventOccurrence(mondayEvent, sun);
    expect(atMon2.toISOString()).toBe(
      argLocal(2026, 3, 9, 17, 0, 0).toISOString()
    );
  });

  it("tuesday → next wednesday (for wednesday event)", () => {
    // Tuesday 2026-03-10 → Wednesday 2026-03-11 17:00
    const tue = argLocal(2026, 3, 10, 9, 0, 0);
    const at = nextEventOccurrence(wednesdayEvent, tue);
    expect(at.toISOString()).toBe(argLocal(2026, 3, 11, 17, 0, 0).toISOString());
  });

  it("wednesday after call → next wednesday (+7)", () => {
    const now = argLocal(2026, 3, 11, 18, 0, 0);
    const at = nextEventOccurrence(wednesdayEvent, now);
    expect(at.toISOString()).toBe(argLocal(2026, 3, 18, 17, 0, 0).toISOString());
  });

  it("accepts unaccented miercoles alias", () => {
    const now = argLocal(2026, 3, 10, 9, 0, 0);
    const at = nextEventOccurrence(
      { weekday: "miercoles", time: "17:00", timezone: TZ },
      now
    );
    expect(at.toISOString()).toBe(argLocal(2026, 3, 11, 17, 0, 0).toISOString());
  });

  it("unknown weekday throws (negative)", () => {
    expect(() =>
      nextEventOccurrence(
        { weekday: "blorbday", time: "17:00", timezone: TZ },
        new Date()
      )
    ).toThrow(/Weekday desconocido/i);
  });
});

describe("getNextCommunityCall (injected clock)", () => {
  it("picks the soonest upcoming among community.events", () => {
    // Sunday → next is Monday call
    const sun = argLocal(2026, 3, 8, 12, 0, 0);
    const next = getNextCommunityCall(sun);
    expect(next).not.toBeNull();
    expect(next.event.id).toBe("community-call-monday");
    expect(next.at.toISOString()).toBe(
      argLocal(2026, 3, 9, 17, 0, 0).toISOString()
    );
  });

  it("after Monday call, before Wednesday → wednesday", () => {
    const tue = argLocal(2026, 3, 10, 12, 0, 0);
    const next = getNextCommunityCall(tue);
    expect(next.event.id).toBe("community-call-wednesday");
  });

  it("after Wednesday call → next Monday", () => {
    const thu = argLocal(2026, 3, 12, 12, 0, 0);
    const next = getNextCommunityCall(thu);
    expect(next.event.id).toBe("community-call-monday");
    expect(next.at.toISOString()).toBe(
      argLocal(2026, 3, 16, 17, 0, 0).toISOString()
    );
  });

  it("catalog monday/wednesday urls match the swapped fix", () => {
    const monday = community.events.find((e) => e.id === "community-call-monday");
    const wednesday = community.events.find(
      (e) => e.id === "community-call-wednesday"
    );
    expect(monday.url).toContain("1535005054405185598");
    expect(wednesday.url).toContain("1506675889658921081");
  });
});
