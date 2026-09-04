import { test, expect, loginAs, TEST_PASSWORD } from "./support/fixtures";
import { FREE_DAILY_AI_LIMIT, type Row } from "./support/mockBackend";

/* The critical path: the journeys that, if broken, mean students cannot use
 * Learnora at all — signing in, paying, generating, quizzing, and being told
 * the truth when any of it fails.
 *
 * Thirty-one scenarios live here; the five layout ones live in mobile.spec.ts,
 * which runs under a phone viewport (a resize mid-test does not reproduce what
 * a phone actually renders, because the app reads the viewport at mount).
 *
 * Every test drives a real browser against the real app with the backend
 * mocked at the network boundary — see support/mockBackend.ts for why that is
 * the boundary, and what it buys.
 */

/* ------------------------------------------------------------------ data */

const QUIZ_QUESTIONS = [
  {
    question: "Powerhouse of the cell?",
    choices: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
    correctIndex: 1,
    topic: "Cells",
  },
  {
    question: "DNA is short for?",
    choices: ["Deoxyribonucleic acid", "Dinitroamine", "Dual nucleic acid", "None"],
    correctIndex: 0,
    topic: "Genetics",
  },
];

function quizRow(overrides: Row = {}): Row {
  return {
    id: "quiz-1",
    title: "Biology basics",
    folder_id: null,
    material_id: null,
    questions_json: QUIZ_QUESTIONS,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/** An attempt as QuizRunner records it, `n` days ago. The evidence layer reads
 *  `answers_json` for per-topic accuracy, so the answers carry topics. */
function attemptRow(
  topic: string,
  correct: number,
  total: number,
  daysAgo = 1,
  overrides: Row = {},
): Row {
  const created = new Date();
  created.setUTCDate(created.getUTCDate() - daysAgo);
  return {
    id: `attempt-${topic}-${daysAgo}`,
    /* One attempt per quiz: the evidence layer counts distinct quizzes, so
       two attempts at the same quiz would read as one quiz taken twice —
       which is what it is, and not what these fixtures mean. */
    quiz_id: `quiz-${topic.toLowerCase()}`,
    score: correct,
    total,
    weak_topics: correct / total < 0.6 ? [topic] : [],
    created_at: created.toISOString(),
    answers_json: Array.from({ length: total }, (_, i) => ({
      questionId: i,
      chosenIndex: 0,
      correct: i < correct,
      topic,
    })),
    ...overrides,
  };
}

function futureExam(daysAway = 30): Row {
  const date = new Date();
  date.setDate(date.getDate() + daysAway);
  return {
    id: 1,
    exam_name: "Biology Paper 1",
    exam_date: date.toISOString().slice(0, 10),
    difficulty: "medium",
    status: "upcoming",
  };
}

/* ============================================================ 1. AUTH (4) */

test.describe("Auth", () => {
  test("sign up creates an account and asks the student to confirm their email", async ({
    page,
    backend,
  }) => {
    await page.goto("signup");

    await page.getByLabel("Full name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("new@test.com");
    await page.getByLabel("Date of birth").fill("2000-01-01");
    await page.getByLabel("Password", { exact: true }).fill("Password1!");
    await page.getByLabel("Confirm password").fill("Password1!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Create Account/ }).click();

    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.getByText("new@test.com")).toBeVisible();

    /* The account is only real if the request carried what the account needs:
       the credentials, the age check's date of birth, and the AI-provider
       consent the sign-up form now requires. */
    const signup = backend.callsTo("/auth/v1/signup").at(-1);
    expect(signup?.body).toMatchObject({
      email: "new@test.com",
      data: { full_name: "Ada Lovelace", dob: "2000-01-01", consent_given: true },
    });
  });

  test("login with valid credentials lands on the dashboard", async ({ page }) => {
    await page.goto("login");
    await page.getByLabel("Email").fill("free@test.com");
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /Log In/ }).click();

    await expect(page).toHaveURL(/\/app\/?$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: "Tasks" })).toBeVisible();
  });

  test("password reset sends a recovery link without confirming the address exists", async ({
    page,
    backend,
  }) => {
    await page.goto("forgot-password");
    await page.getByLabel("Email").fill("free@test.com");
    await page.getByRole("button", { name: /Send Reset Link/ }).click();

    /* Deliberately vague wording — the screen must not tell a stranger
       whether an address is registered. */
    await expect(page.getByText(/If an account exists/)).toBeVisible();
    expect(backend.callsTo("/auth/v1/recover")).toHaveLength(1);
  });

  test("logout ends the session and returns to the sign-in screen", async ({
    page,
    backend,
  }) => {
    await loginAs(page);
    await page.goto("settings");
    /* Two controls carry this name — the sidebar's icon button and the one in
       the Account panel. This is the panel's. */
    await page.locator("main").getByRole("button", { name: "Log Out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /Log In/ })).toBeVisible();
    expect(backend.callsTo("/auth/v1/logout").length).toBeGreaterThan(0);
  });
});

/* =================================================== 2. RATE LIMITING (3) */

test.describe("Rate limiting", () => {
  test("a free student is refused at the 25-generation daily ceiling", async ({
    page,
    backend,
  }) => {
    /* Standing one request short of the ceiling rather than making 25 real
       ones: the limit under test is the server's, and 24 extra round trips
       would only make the test slower and flakier, not more truthful. */
    backend.spendAiRequests(FREE_DAILY_AI_LIMIT - 1);
    await loginAs(page);

    // The 25th generation is still inside the allowance.
    await page.getByRole("button", { name: "What next?" }).click();
    await expect(page.getByRole("region", { name: "Learnora AI chat" })).toBeVisible();
    await expect(page.getByRole("log")).toContainText("Here is a study plan", {
      timeout: 20_000,
    });
    expect(backend.aiRequestsToday).toBe(FREE_DAILY_AI_LIMIT);

    // The 26th is over it, and the refusal has to reach the student.
    const input = page.getByLabel("AI chat input");
    await input.fill("One more thing");
    await input.press("Enter");

    await expect(page.getByRole("log")).toContainText("Rate limit exceeded", {
      timeout: 30_000,
    });
    await expect(page.getByRole("log")).toContainText(
      `all ${FREE_DAILY_AI_LIMIT} AI generations`,
    );
  });

  test("Pro raises the ceiling: the 26th generation of the day succeeds", async ({
    page,
    backend,
  }) => {
    backend.setPlan("pro").spendAiRequests(FREE_DAILY_AI_LIMIT);
    await loginAs(page);

    await page.getByRole("button", { name: "What next?" }).click();

    await expect(page.getByRole("log")).toContainText("Here is a study plan", {
      timeout: 20_000,
    });
    await expect(page.getByRole("log")).not.toContainText("Rate limit exceeded");
    expect(backend.aiRequestsToday).toBe(FREE_DAILY_AI_LIMIT + 1);
  });

  test("the allowance resets at midnight UTC — yesterday's usage does not count", async ({
    page,
    backend,
  }) => {
    /* Yesterday's log rows are what a student would have hit the wall on last
       night. The meter counts from midnight UTC, so today they start clean. */
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    for (let i = 0; i < FREE_DAILY_AI_LIMIT; i++) {
      backend.table("ai_request_log").push({
        id: `yesterday-${i}`,
        user_id: backend.user.id,
        created_at: yesterday.toISOString(),
      });
    }

    await loginAs(page);
    await page.goto("settings");
    await page.getByRole("tab", { name: /Plan/ }).click();

    const meter = page.getByRole("progressbar");
    await expect(meter).toHaveAttribute(
      "aria-valuetext",
      `0 of ${FREE_DAILY_AI_LIMIT} generations used today`,
    );
    await expect(page.getByText(`${FREE_DAILY_AI_LIMIT} of ${FREE_DAILY_AI_LIMIT} left.`)).toBeVisible();
  });
});

/* ========================================================== 3. STRIPE (2) */

test.describe("Stripe", () => {
  test("upgrading sends the student to Stripe checkout", async ({
    page,
    backend,
    stripeRedirects,
  }) => {
    await loginAs(page);
    await page.goto("settings");
    await page.getByRole("tab", { name: /Plan/ }).click();

    /* Two steps on purpose: the plan panel's button opens the paywall, and
       the paywall is where a price is chosen and checkout actually starts. */
    await page.locator("main").getByRole("button", { name: "Upgrade to Pro" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Upgrade to Pro" })
      .click();

    await expect
      .poll(() => stripeRedirects.length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(stripeRedirects[0]).toContain("checkout.stripe.com");
    expect(backend.callsTo("/functions/v1/stripe-billing").at(-1)?.body).toMatchObject({
      action: "checkout",
    });
  });

  test("a Pro student cancels through the Stripe billing portal", async ({
    page,
    backend,
    stripeRedirects,
  }) => {
    backend.setPlan("pro");
    await loginAs(page);
    await page.goto("settings");
    await page.getByRole("tab", { name: /Plan/ }).click();

    /* Cancelling is Stripe's own screen on purpose — the app's job is to get
       the student there authenticated, which is what this asserts. */
    await page.getByRole("button", { name: /Manage billing/ }).click();

    await expect
      .poll(() => stripeRedirects.length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(stripeRedirects[0]).toContain("billing.stripe.com");
  });
});

/* ========================================================= 4. QUIZZES (5) */

test.describe("Quizzes", () => {
  test("creating a quiz from a topic saves it to the library", async ({
    page,
    backend,
  }) => {
    await loginAs(page);
    await page.goto("library/quizzes");
    await page.getByRole("button", { name: "Create a quiz" }).click();

    /* The radio itself is visually hidden behind a styled card, so the label
       is what a student actually clicks — and what this clicks. */
    await page.getByText("Just a topic").click();
    await page.getByRole("textbox", { name: "Topic" }).fill("Photosynthesis");
    await page.getByRole("button", { name: /Continue to results/ }).click();
    await page.getByRole("button", { name: /Review and create/ }).click();
    await page.getByRole("button", { name: /^Create .*quiz/ }).click();

    await expect
      .poll(() => backend.table("quizzes").length, { timeout: 30_000 })
      .toBe(1);
    const saved = backend.table("quizzes")[0];
    expect(saved.title).toBeTruthy();
    expect(Array.isArray(saved.questions_json)).toBe(true);
  });

  test("taking a quiz walks through every question", async ({ page, backend }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    await expect(page.getByText("Question 1 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Powerhouse of the cell?" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
    await page.getByRole("button", { name: /Next Question/ }).click();

    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "DNA is short for?" }),
    ).toBeVisible();
  });

  test("answering shows feedback that matches what the student actually picked", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    /* A wrong answer must not be met with praise — the runner states the
       verdict itself rather than replaying the question's canned feedback. */
    await page.getByRole("button", { name: "Nucleus", exact: true }).click();
    const panel = page.locator("main");
    await expect(panel).toContainText(/not quite|incorrect|wrong|close/i);
    await expect(panel).not.toContainText(/nice work|correct!/i);
  });

  test("finishing a quiz saves the attempt with the real score", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
    await page.getByRole("button", { name: /Next Question/ }).click();
    await page.getByRole("button", { name: "Deoxyribonucleic acid", exact: true }).click();
    await page.getByRole("button", { name: /See results/ }).click();

    await expect
      .poll(() => backend.table("quiz_attempts").length, { timeout: 15_000 })
      .toBe(1);
    const attempt = backend.table("quiz_attempts")[0];
    expect(attempt).toMatchObject({ quiz_id: "quiz-1", score: 2, total: 2 });
  });

  test("the results screen reports the score and names what to review", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    // One right, one wrong — so there is a weak topic worth naming.
    await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
    await page.getByRole("button", { name: /Next Question/ }).click();
    await page.getByRole("button", { name: "Dinitroamine", exact: true }).click();
    await page.getByRole("button", { name: /See results/ }).click();

    await expect(page.getByRole("heading", { name: /Quiz Complete/ })).toBeVisible();
    await expect(page.getByText("1 / 2 correct")).toBeVisible();
    await expect(page.getByText(/Topics to review:.*Genetics/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Review answers/ })).toBeVisible();
  });
});

/* =================================================== 5. GRADE FORECAST (3) */

test.describe("Grade forecast", () => {
  /* Trajectory is a Pro feature and needs an exam to project onto; the
     quiz-only forecast then fills in for a student with no flashcard decks. */
  test.beforeEach(async ({ backend }) => {
    backend.setPlan("pro");
    backend.seed("exams", [futureExam(30)]);
    backend.seed("quizzes", [
      quizRow({ id: "quiz-cells", title: "Cells" }),
      quizRow({ id: "quiz-genetics", title: "Genetics" }),
    ]);
  });

  test("shows a predicted grade range built from real quiz results", async ({
    page,
    backend,
  }) => {
    backend.seed("quiz_attempts", [
      attemptRow("Cells", 8, 10, 2),
      attemptRow("Genetics", 7, 10, 5),
    ]);
    await loginAs(page);
    await page.goto("trajectory");

    await expect(
      page.getByRole("heading", { name: /Biology Paper 1: \d+–\d+/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Based on 2 quizzes/)).toBeVisible();
    await expect(page.getByText(/scoring 75% right now/)).toBeVisible();
  });

  test("names the weak topics that are costing the student points", async ({
    page,
    backend,
  }) => {
    backend.seed("quiz_attempts", [
      attemptRow("Cells", 9, 10, 2),
      attemptRow("Genetics", 2, 10, 3),
    ]);
    await loginAs(page);
    await page.goto("trajectory");

    await expect(page.getByText(/Weak:/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Genetics/)).toBeVisible();
    await expect(page.getByText(/costing you about 5 points/)).toBeVisible();
  });

  test("says how to improve the forecast rather than leaving it as a number", async ({
    page,
    backend,
  }) => {
    backend.seed("quiz_attempts", [attemptRow("Cells", 6, 10, 1)]);
    await loginAs(page);
    await page.goto("trajectory");

    await expect(page.getByText(/This is the rough version/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: /Turn a material into a deck/ }),
    ).toBeVisible();
  });
});

/* ============================================================== 6. AI (3) */

test.describe("AI grounding", () => {
  test("the assistant is given the student's real quiz history", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    backend.seed("quiz_attempts", [
      attemptRow("Cells", 9, 10, 2),
      attemptRow("Genetics", 3, 10, 4),
    ]);
    await loginAs(page);

    await page.getByRole("button", { name: "What next?" }).click();
    await expect
      .poll(() => backend.callsTo("/functions/v1/learnora-ai").length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    /* The claim is not "the model answered well" — a mock cannot show that.
       It is that the app handed the model this student's actual numbers, so
       an answer *can* be grounded rather than generic. */
    const sent = JSON.stringify(backend.callsTo("/functions/v1/learnora-ai").at(-1)?.body);
    expect(sent).toContain("PERFORMANCE EVIDENCE");
    expect(sent).toContain("Overall accuracy: 60%");
    expect(sent).toContain("Cells");
    expect(sent).toContain("Genetics");
  });

  test("with no quiz data the assistant is told to admit the gap, not estimate", async ({
    page,
    backend,
  }) => {
    await loginAs(page);

    await page.getByRole("button", { name: "What next?" }).click();
    await expect
      .poll(() => backend.callsTo("/functions/v1/learnora-ai").length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    const sent = JSON.stringify(backend.callsTo("/functions/v1/learnora-ai").at(-1)?.body);
    expect(sent).toContain("There is no current performance data for this student");
    expect(sent).toContain("HONESTY RULE");
  });

  test("how sure the evidence is travels with it, as a number", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    backend.seed("quiz_attempts", [attemptRow("Cells", 4, 5, 1)]);
    await loginAs(page);

    await page.getByRole("button", { name: "What next?" }).click();
    await expect
      .poll(() => backend.callsTo("/functions/v1/learnora-ai").length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    /* One five-question quiz is thin evidence and has to be labelled as such,
       so the model hedges instead of pronouncing on a sample of five. */
    const sent = JSON.stringify(backend.callsTo("/functions/v1/learnora-ai").at(-1)?.body);
    expect(sent).toMatch(/Evidence strength: (NONE|LOW|MODERATE|GOOD) \(\d\.\d\d of 1\)/);
    expect(sent).toContain("Evidence strength: LOW");
  });
});

/* ========================================================== 7. ERRORS (5) */

test.describe("Errors", () => {
  test("losing the connection says so instead of failing silently", async ({
    page,
    backend,
  }) => {
    backend.seed("tasks", [{ id: 1, text: "Read chapter 4", is_done: false, due_date: null }]);
    await loginAs(page);
    await page.goto("tasks");
    await expect(page.getByText("Read chapter 4")).toBeVisible();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await expect(page.getByText(/You're offline/)).toBeVisible({ timeout: 15_000 });
    // The work already on screen must survive going offline.
    await expect(page.getByText("Read chapter 4")).toBeVisible();
    await page.context().setOffline(false);
  });

  test("an empty login form is refused without a request leaving the browser", async ({
    page,
    backend,
  }) => {
    await page.goto("login");
    await page.getByRole("button", { name: /Log In/ }).click();

    /* The browser's own constraint validation blocks the submit; what matters
       for the test is that nothing was sent and the student is still here. */
    expect(backend.callsTo("/auth/v1/token")).toHaveLength(0);
    await expect(page.getByLabel("Email")).toBeFocused();
  });

  test("a slow response leaves a loading state, not a broken screen", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    backend.stall("/rest/v1/quizzes");
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    /* Nothing ever comes back. The app must stay on its feet — a spinner or
       skeleton, no crash, no "not found" claimed before the answer exists. */
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).not.toContainText("Quiz not found");
    /* Nor may it claim the failure is the student's: no crash screen, and the
       app still knows where it is. */
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page).toHaveURL(/\/quiz\/quiz-1/);
  });

  test("a server error is reported to the student rather than shown as empty", async ({
    page,
    backend,
  }) => {
    await loginAs(page);
    backend.stub("/rest/v1/quizzes", 500, { message: "internal error" });
    await page.goto("quiz/quiz-1");

    await expect(page.locator("body")).toContainText(
      /couldn.t|error|not found|try again|went wrong/i,
      { timeout: 20_000 },
    );
  });

  test("an AI failure is surfaced in the chat and the app stays usable", async ({
    page,
    backend,
  }) => {
    await loginAs(page);
    backend.stub("/functions/v1/learnora-ai", 500, { error: "Model unavailable" });

    await page.getByRole("button", { name: "What next?" }).click();

    await expect(page.getByRole("log")).toContainText(/unavailable|failed|error/i, {
      timeout: 30_000,
    });
    // Still navigable afterwards — one failed generation is not a dead app.
    await page.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks/);
  });
});

/* ============================================================ 8. DATA (2) */

test.describe("Data safety", () => {
  test("quiz progress survives a reload and is offered back", async ({
    page,
    backend,
  }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
    await page.getByRole("button", { name: /Next Question/ }).click();
    await expect(page.getByText("Question 2 of 2")).toBeVisible();

    // The draft is debounced, so give the write its window before reloading.
    await expect
      .poll(
        () => page.evaluate(() => window.localStorage.getItem("learnora_quiz_draft_quiz-1")),
        { timeout: 10_000 },
      )
      .not.toBeNull();

    await page.reload();

    await expect(page.getByRole("alertdialog")).toContainText(/Resume/i, {
      timeout: 20_000,
    });
  });

  test("a session that has gone stale sends the student back to sign in", async ({
    page,
    backend,
  }) => {
    await loginAs(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    /* The refresh token is revoked server-side — the case where someone comes
       back to a tab left open overnight. The app must not sit there rendering
       a signed-in shell it can no longer load anything into. */
    backend.sessionRevoked = true;
    await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes("auth-token"));
      if (!key) return;
      const raw = window.localStorage.getItem(key)!;
      const decoded = raw.startsWith("base64-")
        ? JSON.parse(atob(raw.slice("base64-".length)))
        : JSON.parse(raw);
      decoded.expires_at = Math.floor(Date.now() / 1000) - 60;
      const next = JSON.stringify(decoded);
      window.localStorage.setItem(
        key,
        raw.startsWith("base64-") ? `base64-${btoa(next)}` : next,
      );
    });
    await page.reload();

    await expect(page).toHaveURL(/\/login/, { timeout: 25_000 });
  });
});

/* ================================== 9. THE REST OF THE CRITICAL PATH (4) */

/* Four more that belong in a suite called "critical path" — each one guards a
   promise the product makes that nothing above covers: a legal requirement, a
   security boundary, and the two redirects that decide where a student lands. */
test.describe("Guardrails", () => {
  test("sign-up is blocked until AI-provider consent is given", async ({
    page,
    backend,
  }) => {
    await page.goto("signup");
    await page.getByLabel("Full name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("new@test.com");
    await page.getByLabel("Date of birth").fill("2000-01-01");
    await page.getByLabel("Password", { exact: true }).fill("Password1!");
    await page.getByLabel("Confirm password").fill("Password1!");
    // Consent deliberately left unchecked.
    await page.getByRole("button", { name: /Create Account/ }).click();

    expect(backend.callsTo("/auth/v1/signup")).toHaveLength(0);
    await expect(page.getByRole("checkbox")).toBeFocused();
  });

  test("a wrong password is rejected and leaves the student signed out", async ({
    page,
  }) => {
    await page.goto("login");
    await page.getByLabel("Email").fill("free@test.com");
    await page.getByLabel("Password", { exact: true }).fill("not-my-password");
    await page.getByRole("button", { name: /Log In/ }).click();

    await expect(page.getByRole("alert")).toContainText(/Incorrect email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("deleting an account demands the password first", async ({ page, backend }) => {
    await loginAs(page);
    await page.goto("settings");
    await page.getByRole("tab", { name: /Danger Zone/ }).click();

    await page.getByRole("button", { name: /Delete Account/ }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Yes, delete my account" })
      .click();

    /* The second step is a password, not another "are you sure?" — backing out
       here must delete nothing. */
    const passwordStep = page.getByRole("alertdialog");
    await expect(passwordStep).toContainText("Confirm your password");
    await passwordStep.getByRole("button", { name: "Keep my account" }).click();

    expect(backend.callsTo("/functions/v1/delete-account")).toHaveLength(0);
  });

  test("a deep link opened signed-out returns the student to it after login", async ({
    page,
  }) => {
    await page.goto("exams");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

    await page.getByLabel("Email").fill("free@test.com");
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /Log In/ }).click();

    await expect(page).toHaveURL(/\/exams/, { timeout: 20_000 });
  });
});
