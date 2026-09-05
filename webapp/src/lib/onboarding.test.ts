import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  EMPTY_ANSWERS,
  ONBOARDING_LOCAL_KEY,
  ONBOARDING_RELEASE_ISO,
  dashboardLayoutFor,
  lifeContextPatchFor,
  markOnboardedLocally,
  nextStepsFor,
  parseAnswers,
  readOnboarding,
  settingsPatchFor,
  shouldOnboard,
  studyPaceFor,
  studyProfilePatchFor,
  type OnboardingAnswers,
} from "./onboarding";
import { DEFAULT_DASHBOARD_LAYOUT } from "../views/dashboard/DashboardCustomizeModal";

function answers(patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  return { ...EMPTY_ANSWERS, ...patch };
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    created_at: "2026-10-01T00:00:00.000Z",
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    ...overrides,
  } as User;
}

beforeEach(() => {
  localStorage.clear();
});

describe("parseAnswers", () => {
  it("returns null for anything that isn't an object", () => {
    expect(parseAnswers(undefined)).toBeNull();
    expect(parseAnswers(null)).toBeNull();
    expect(parseAnswers("skipped")).toBeNull();
  });

  it("drops values it doesn't recognise rather than trusting them", () => {
    const parsed = parseAnswers({
      goal: "phd",
      focusAreas: ["exams", "cooking", 7],
      coachStyle: "drill_sergeant",
      detail: "verbose",
      studyTime: "afternoon",
      weekdayCapacityMins: "lots",
    });

    expect(parsed).toMatchObject({
      goal: null,
      focusAreas: ["exams"],
      coachStyle: EMPTY_ANSWERS.coachStyle,
      detail: EMPTY_ANSWERS.detail,
      studyTime: null,
      weekdayCapacityMins: null,
    });
  });

  it("clamps a capacity that is out of range", () => {
    expect(
      parseAnswers({ weekdayCapacityMins: 5000 })?.weekdayCapacityMins,
    ).toBe(900);
    expect(
      parseAnswers({ weekdayCapacityMins: -30 })?.weekdayCapacityMins,
    ).toBe(0);
  });

  /* exam_type is a CHECK constraint on profiles, so an unrecognised board
     reaching the write would fail the whole study-profile update. */
  it("drops an exam board that isn't one of the allowed values", () => {
    expect(parseAnswers({ examType: "edexcel_igcse" })?.examType).toBeNull();
    expect(parseAnswers({ examType: "gcse" })?.examType).toBe("gcse");
  });

  it("trims a target grade and treats a blank one as unset", () => {
    expect(parseAnswers({ targetGrade: "  A*  " })?.targetGrade).toBe("A*");
    expect(parseAnswers({ targetGrade: "   " })?.targetGrade).toBeNull();
    expect(parseAnswers({ targetGrade: 7 })?.targetGrade).toBeNull();
  });
});

describe("studyPaceFor", () => {
  /* Derived from the capacity question the rhythm step already asks, rather
     than asked again in different words. */
  it("maps each capacity rung onto a pace", () => {
    expect(studyPaceFor(answers({ weekdayCapacityMins: 30 }))).toBe("light");
    expect(studyPaceFor(answers({ weekdayCapacityMins: 60 }))).toBe("balanced");
    expect(studyPaceFor(answers({ weekdayCapacityMins: 120 }))).toBe(
      "intensive",
    );
    expect(studyPaceFor(answers({ weekdayCapacityMins: 180 }))).toBe(
      "intensive",
    );
  });

  it("stays null when the rhythm step was never answered", () => {
    expect(studyPaceFor(EMPTY_ANSWERS)).toBeNull();
  });
});

describe("studyProfilePatchFor", () => {
  it("carries the wizard's answers into the columns the planner reads", () => {
    const patch = studyProfilePatchFor(
      answers({
        examType: "ib",
        targetGrade: "7",
        weekdayCapacityMins: 120,
      }),
      "Organic Chemistry",
    );

    expect(patch).toEqual({
      subject: "Organic Chemistry",
      examType: "ib",
      targetGrade: "7",
      studyPace: "intensive",
    });
  });

  /* Skipping every optional field must write nulls, not empty strings — the
     planner renders no STUDENT CONTEXT block at all for a fully-null profile,
     which is the correct outcome for someone who answered nothing. */
  it("writes nulls rather than blanks when nothing was answered", () => {
    expect(studyProfilePatchFor(EMPTY_ANSWERS, "   ")).toEqual({
      subject: null,
      examType: null,
      targetGrade: null,
      studyPace: null,
    });
  });
});

describe("shouldOnboard", () => {
  it("is false when nobody is signed in", () => {
    expect(shouldOnboard(null)).toBe(false);
  });

  it("is true for a brand new account with no saved answers", () => {
    expect(shouldOnboard(fakeUser())).toBe(true);
  });

  it("is false once the wizard has been completed", () => {
    const user = fakeUser({
      user_metadata: {
        onboarding: answers({ completedAt: "2026-10-02T00:00:00.000Z" }),
      },
    });
    expect(shouldOnboard(user)).toBe(false);
  });

  it("is false once the wizard has been skipped", () => {
    const user = fakeUser({
      user_metadata: { onboarding: answers({ skipped: true }) },
    });
    expect(shouldOnboard(user)).toBe(false);
  });

  /* The whole point of the local mirror: a completed wizard whose metadata
     write failed must not send the student round again. */
  it("is false when only the local mirror recorded the account", () => {
    markOnboardedLocally("user-1");
    expect(shouldOnboard(fakeUser())).toBe(false);
  });

  it("does not let one account's mirror onboard-skip another", () => {
    markOnboardedLocally("someone-else");
    expect(shouldOnboard(fakeUser())).toBe(true);
  });

  it("grandfathers in accounts older than the release", () => {
    const user = fakeUser({ created_at: "2026-01-01T00:00:00.000Z" });
    expect(shouldOnboard(user, ONBOARDING_RELEASE_ISO)).toBe(false);
  });

  it("leaves an account with an unreadable created_at alone", () => {
    expect(shouldOnboard(fakeUser({ created_at: "" }))).toBe(false);
  });
});

describe("readOnboarding", () => {
  it("reads the answers off user metadata", () => {
    const user = fakeUser({
      user_metadata: { onboarding: answers({ goal: "university" }) },
    });
    expect(readOnboarding(user)?.goal).toBe("university");
  });

  it("is null for a user who has never answered", () => {
    expect(readOnboarding(fakeUser())).toBeNull();
  });
});

describe("settingsPatchFor", () => {
  it("carries the AI voice straight through and derives a depth", () => {
    const patch = settingsPatchFor(
      answers({ coachStyle: "professor", detail: "detailed" }),
    );
    expect(patch.aiPersona).toBe("professor");
    expect(patch.aiConciseness).toBe("detailed");
    expect(patch.aiDepth).toBe(4);
  });

  it("picks the exam style when exam practice is one of the focus areas", () => {
    expect(
      settingsPatchFor(answers({ focusAreas: ["understanding", "exams"] }))
        .aiStyle,
    ).toBe("exam_trap");
  });

  it("leaves aiStyle alone when no focus area implies one", () => {
    expect(
      settingsPatchFor(answers({ focusAreas: ["social"] })),
    ).not.toHaveProperty("aiStyle");
  });

  it("only opts into reminders when deadlines were the stated problem", () => {
    expect(
      settingsPatchFor(answers({ focusAreas: ["deadlines"] }))
        .notifyStudyReminders,
    ).toBe(true);
    expect(
      settingsPatchFor(answers({ focusAreas: ["recall"] })),
    ).not.toHaveProperty("notifyStudyReminders");
  });
});

describe("lifeContextPatchFor", () => {
  it("is empty when neither rhythm question was answered", () => {
    expect(lifeContextPatchFor(answers())).toEqual({});
  });

  it("maps the time-of-day answer onto a chronotype", () => {
    expect(
      lifeContextPatchFor(answers({ studyTime: "night" })).chronotype,
    ).toBe("night");
  });

  it("gives the weekend an extra hour over the weekday capacity", () => {
    const patch = lifeContextPatchFor(answers({ weekdayCapacityMins: 120 }));
    expect(patch.weekdayCapacityMins).toBe(120);
    expect(patch.weekendCapacityMins).toBe(180);
  });
});

describe("dashboardLayoutFor", () => {
  it("leaves the defaults untouched when nothing was picked", () => {
    expect(dashboardLayoutFor(answers())).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("hides the sections none of the picks speak to", () => {
    const layout = dashboardLayoutFor(answers({ focusAreas: ["deadlines"] }));
    expect(layout.visibleSections.todayTimeline).toBe(true);
    expect(layout.visibleSections.sessionsCommunity).toBe(false);
    expect(layout.visibleSections.recentNotebooks).toBe(false);
  });

  it("always keeps the priorities section, whatever was picked", () => {
    expect(
      dashboardLayoutFor(answers({ focusAreas: ["social"] })).visibleSections
        .priorities,
    ).toBe(true);
  });

  it("shows the community section only for someone who asked for it", () => {
    expect(
      dashboardLayoutFor(answers({ focusAreas: ["social"] })).visibleSections
        .sessionsCommunity,
    ).toBe(true);
  });
});

describe("nextStepsFor", () => {
  it("returns one deep link per focus area", () => {
    const steps = nextStepsFor(answers({ focusAreas: ["social", "planning"] }));
    expect(steps.map((s) => s.to)).toEqual(["/my-week", "/room"]);
  });

  it("is empty for someone who picked nothing", () => {
    expect(nextStepsFor(answers())).toEqual([]);
  });
});

describe("markOnboardedLocally", () => {
  it("does not grow without bound on a shared browser", () => {
    for (let i = 0; i < 20; i += 1) markOnboardedLocally(`user-${i}`);
    const stored = JSON.parse(
      localStorage.getItem(ONBOARDING_LOCAL_KEY) ?? "[]",
    ) as string[];
    expect(stored).toHaveLength(8);
    expect(stored).toContain("user-19");
  });
});
