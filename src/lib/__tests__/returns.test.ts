import { describe, expect, it } from "vitest";
import {
  formatHoursRemaining,
  formatReturnWindow,
  formatReturnWindowAdjective,
  returnEligibility,
  returnWindowInDays,
} from "../returns";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-17T12:00:00.000Z");

function delivered(hoursAgo: number) {
  return {
    status: "delivered",
    deliveredAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  };
}

describe("formatReturnWindow", () => {
  it("renders the 48-hour policy in hours", () => {
    expect(formatReturnWindow(48)).toBe("48 hours");
  });

  it("renders a short window in hours", () => {
    expect(formatReturnWindow(24)).toBe("24 hours");
    expect(formatReturnWindow(1)).toBe("1 hour");
  });

  it("renders a long window in days", () => {
    expect(formatReturnWindow(720)).toBe("30 days");
    expect(formatReturnWindow(168)).toBe("7 days");
  });

  it("says so when returns are switched off", () => {
    expect(formatReturnWindow(0)).toBe("no returns");
  });
});

describe("formatReturnWindowAdjective", () => {
  /*
   * The footer link and the page description put the window in front of a noun,
   * where `formatReturnWindow`'s noun phrase reads wrong — "48 hours returns".
   */
  it("hyphenates and singularises the unit", () => {
    expect(formatReturnWindowAdjective(48)).toBe("48-hour returns");
    expect(formatReturnWindowAdjective(24)).toBe("24-hour returns");
    expect(formatReturnWindowAdjective(720)).toBe("30-day returns");
  });

  it("says so when returns are switched off", () => {
    expect(formatReturnWindowAdjective(0)).toBe("no returns");
  });
});

describe("returnWindowInDays", () => {
  it("converts for the legacy email token", () => {
    expect(returnWindowInDays(48)).toBe(2);
    expect(returnWindowInDays(720)).toBe(30);
  });
});

describe("returnEligibility", () => {
  it("allows a return inside the window", () => {
    const verdict = returnEligibility(delivered(10), 48, NOW);
    expect(verdict.eligible).toBe(true);
  });

  it("reports the hours left", () => {
    const verdict = returnEligibility(delivered(10), 48, NOW);
    if (!verdict.eligible) throw new Error("expected eligible");
    expect(verdict.hoursRemaining).toBe(38);
  });

  /** The whole point of the change: past 48 hours, nothing is accepted. */
  it("refuses a return after the window closes", () => {
    const verdict = returnEligibility(delivered(49), 48, NOW);
    expect(verdict.eligible).toBe(false);
  });

  it("refuses exactly on the boundary", () => {
    // 48 hours after delivery the window is spent, not still open.
    expect(returnEligibility(delivered(48), 48, NOW).eligible).toBe(false);
  });

  it("allows one hour before the boundary", () => {
    expect(returnEligibility(delivered(47), 48, NOW).eligible).toBe(true);
  });

  /*
   * Measured from delivery, not from the order date — a parcel that spent a week
   * in transit has not used up any of the inspection window.
   */
  it("ignores how long the parcel spent in transit", () => {
    const slow = {
      status: "delivered",
      deliveredAt: new Date(NOW - 2 * HOUR).toISOString(),
    };
    expect(returnEligibility(slow, 48, NOW).eligible).toBe(true);
  });

  it("refuses an order that has not been delivered", () => {
    const verdict = returnEligibility({ status: "shipped" }, 48, NOW);
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) throw new Error("expected ineligible");
    expect(verdict.reason).toMatch(/not been delivered/i);
  });

  it("refuses a cancelled order", () => {
    const verdict = returnEligibility({ status: "cancelled" }, 48, NOW);
    expect(verdict.eligible).toBe(false);
  });

  it("refuses everything when the window is zero", () => {
    expect(returnEligibility(delivered(1), 0, NOW).eligible).toBe(false);
  });

  it("refuses an unreadable delivery date rather than throwing", () => {
    const verdict = returnEligibility(
      { status: "delivered", deliveredAt: "not a date" },
      48,
      NOW,
    );
    expect(verdict.eligible).toBe(false);
  });

  it("names the closing date when refusing", () => {
    const verdict = returnEligibility(delivered(100), 48, NOW);
    if (verdict.eligible) throw new Error("expected ineligible");
    expect(verdict.reason).toMatch(/48 hours/);
    expect(verdict.reason).toMatch(/closed on/);
  });

  it("honours a long window", () => {
    expect(returnEligibility(delivered(500), 720, NOW).eligible).toBe(true);
    expect(returnEligibility(delivered(800), 720, NOW).eligible).toBe(false);
  });
});

describe("formatHoursRemaining", () => {
  it("counts down in hours inside two days", () => {
    expect(formatHoursRemaining(38)).toBe("38 hours left");
  });

  it("avoids claiming zero hours", () => {
    expect(formatHoursRemaining(1)).toBe("less than an hour left");
    expect(formatHoursRemaining(0)).toBe("less than an hour left");
  });

  it("switches to days for a longer window", () => {
    expect(formatHoursRemaining(100)).toBe("4 days left");
  });
});
