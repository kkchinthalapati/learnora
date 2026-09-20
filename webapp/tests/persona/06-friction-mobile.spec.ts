import {
  test,
  loginAs,
  undersizedTapTargets,
  hasHorizontalOverflow,
} from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 6 — "It's the night before my exam and my wifi is bad."
 *
 * A Grade 9 student on a free plan, mostly on a phone, runs into every rough
 * edge at once: the daily AI allowance runs out, the server falls over, a
 * request hangs, the wifi drops, and the whole thing has to be usable on a
 * 393px screen.
 *
 * Nothing here judges what the AI said — the AI is stubbed. Everything
 * recorded is failure handling and layout, which are observable.
 *
 * Almost every step is wrapped: a journey that dies halfway writes no log,
 * and the log is the point.
 */

const PHONE = { width: 393, height: 852 };

/* The dashboard's "What next?" AI actions card only renders once the account
 * has some activity, so on a brand-new free account the only way in to the
 * assistant is the command palette's `ai:` prefix — which is itself a
 * finding, recorded in the log where it happens. */
async function openChatAndAsk(page: import("@playwright/test").Page, prompt: string) {
  await page.getByRole("button", { name: "Search and command palette" }).first().click();
  const box = page.getByLabel("Search commands, notes, subjects, or actions");
  await box.fill(`ai: ${prompt}`);
  await page.waitForTimeout(600);
  await box.press("Enter");
}

/** Only the offenders a thumb could actually reach: the drawer sidebar stays
 *  in the DOM off-canvas on a phone, and counting it inflates every screen. */
async function onScreenUndersized(page: import("@playwright/test").Page) {
  const all = await undersizedTapTargets(page);
  const onScreen = await page.evaluate(() => {
    const out: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      "button, a[href], input[type=checkbox], input[type=radio], [role=button], [role=tab], [role=switch]",
    );
    for (const node of nodes) {
      const b = node.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right <= 0 || b.left >= window.innerWidth) continue;
      if (b.bottom < 0 || b.top > window.innerHeight) continue;
      out.push(
        `${node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 40) || node.tagName}|${Math.round(b.width)}x${Math.round(b.height)}`,
      );
    }
    return out;
  });
  const visibleLabels = new Set(onScreen.map((s) => s.split("|")[0]));
  return {
    all,
    inViewport: all.filter((o) => visibleLabels.has(o.label)),
  };
}

async function safe(log: StudentLog, what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    log.saw(`[step failed: ${what}] ${(error as Error).message.slice(0, 300)}`);
  }
}

test("friction: out of AI, broken server, no wifi, small screen", async ({
  page,
  backend,
}) => {
  test.setTimeout(600_000);
  const log = new StudentLog("06-friction-mobile", page);

  /* Short defaults on purpose: several steps here deliberately hang a
     request, and a 30s default navigation timeout on a page whose network
     never goes idle burns the whole budget before the journey finishes. */
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  /* The log is the deliverable, so it gets written even if the journey dies. */
  let finished = false;
  const flush = () => {
    if (finished) return;
    finished = true;
    log.write({ finalUrl: page.url(), viewportAtEnd: PHONE });
  };

  try {
  log.did("Logging in the night before my exam (desktop viewport first)");
  await log.timed("sign in", async () => {
    await loginAs(page);
  });

  /* The Step-by-step Solver is the one AI surface a student can reach in two
     taps from the sidebar, so it carries the 500, the hang and the exhausted
     allowance — the same screen three times, which makes the three failures
     directly comparable. */
  const askSolver = async (what: string, question: string) => {
    await safe(log, what, async () => {
      await page.goto("solver");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByTestId("mistake-input").fill(question);
      await page.getByTestId("diagnose-submit-btn").click();
    });
  };

  /* ============================================= B3. a 500 from the server */

  log.did("Opening the Step-by-step solver to ask about my chem homework");
  await safe(log, "open solver", async () => {
    await page.goto("solver");
    await page.waitForLoadState("networkidle").catch(() => {});
  });
  await log.shot("solver-before");
  log.saw(`Solver screen before I try: ${await log.visibleText(700)}`);

  log.did("The server explodes (stub learnora-ai -> 500) and I press Find my mistake");
  backend.stub("learnora-ai", 500, { error: "server exploded" }, { times: 1 });
  await log.timed("solver submit -> 500 handled", async () => {
    await askSolver("solver submit into a 500", "why does my equation not balance");
    await page.waitForTimeout(6000);
  });
  await log.shot("solver-500");
  const solver500 = await log.visibleText(1800);
  log.saw(`Solver screen after the 500:\n${solver500}`);
  log.saw(
    `Does it say anything went wrong? ${
      /error|went wrong|failed|try again|couldn't|could not/i.test(solver500)
        ? "yes, error wording on screen"
        : "NO — no error/failure wording anywhere on screen"
    }`,
  );
  log.saw(
    `learnora-ai calls so far=${backend.callsTo("learnora-ai").length} (so the 500 really was delivered)`,
  );

  /* ==================================================== B4. it hangs */

  log.did("Bad wifi: the next solver request hangs forever (backend.stall('learnora-ai'))");
  backend.stall("learnora-ai", { times: 1 });
  await askSolver("solver submit into a hang", "explain limiting reagents");
  for (const seconds of [2, 5, 10, 15]) {
    await safe(log, `waiting ${seconds}s on the solver hang`, async () => {
      await page.waitForTimeout(seconds === 2 ? 2000 : seconds === 15 ? 5000 : 3000);
      const btn = await page
        .getByTestId("diagnose-submit-btn")
        .innerText()
        .catch(() => "(button gone)");
      const busy = await page
        .getByTestId("diagnose-submit-btn")
        .isDisabled()
        .then((d) => (d ? "disabled" : "enabled"))
        .catch(() => "?");
      log.saw(
        `~${seconds}s into the solver hang: submit button says "${btn.replace(/\s+/g, " ")}" (${busy})`,
      );
    });
  }
  await log.shot("solver-hanging");
  const hangAffordances2 = await log.affordances();
  log.saw(`While the solver hangs I can click: ${hangAffordances2.join(" | ")}`);
  log.saw(
    `Any way to cancel/stop the solver request? ${
      hangAffordances2.some((a) => /stop|cancel|abort/i.test(a))
        ? "yes, a stop/cancel control is present"
        : "no stop/cancel control among the visible controls"
    }`,
  );
  log.saw(
    `Does anything on screen explain the wait? ${(await log.visibleText(900)).replace(/\s+/g, " ").slice(0, 400)}`,
  );

  /* ================================================== A1. out of AI: a tool */

  log.did(
    "Now today's Step-by-step solver goes are used up (backend.spendAiRequests(999, 'debugger'))",
  );
  backend.spendAiRequests(999, "debugger");
  await log.timed("solver submit -> over the allowance", async () => {
    await askSolver(
      "solver submit over the allowance",
      "I keep messing up balancing chemical equations",
    );
    await page.waitForTimeout(6000);
  });
  await log.shot("solver-out-of-allowance");
  log.saw(`Solver screen AFTER pressing the button:\n${await log.visibleText(1400)}`);
  log.saw(`What I can click now: ${(await log.affordances()).join(" | ")}`);
  log.saw(
    `Did anything mention the limit? ${
      (await log.visibleText(4000)).includes("allowance") ? "yes, the word 'allowance' is on screen" : "no 'allowance' wording on screen"
    }`,
  );
  log.thought(
    "Is this my fault? Did I break it? When does it come back? Recording only what is on screen.",
  );

  /* ================================================ A2. out of AI: chat */

  log.did("Trying to find the chat on the dashboard");
  await safe(log, "look for dashboard chat opener", async () => {
    await page.goto("dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("tab", { name: "Activity & Peers" }).click();
    await page.waitForTimeout(1500);
    log.saw(
      `Is there a "What next?" button to start the AI chat? ${
        (await page
          .getByRole("button", { name: "What next?" })
          .isVisible()
          .catch(() => false))
          ? "yes"
          : "NO — on a new account the AI actions card is not on the dashboard"
      }`,
    );
    log.saw(`Dashboard 'Activity & Peers' tab offers: ${(await log.affordances()).join(" | ")}`);
  });
  await log.shot("dashboard-activity-tab");

  log.did("Falling back to the ⌘K palette and typing 'ai: ...' to reach the chat");
  await safe(log, "open chat via palette", async () => {
    await openChatAndAsk(page, "what should I revise tonight");
    await page.waitForTimeout(5000);
  });
  await log.shot("chat-open");
  log.saw(
    `Did a chat panel appear? ${
      (await page
        .getByRole("region", { name: "Learnora AI chat" })
        .isVisible()
        .catch(() => false))
        ? "yes"
        : "no"
    }`,
  );
  log.saw(
    `Chat transcript after the first question: ${await page
      .getByRole("log")
      .innerText()
      .then((t) => t.slice(0, 900))
      .catch(() => "(no transcript element found)")}`,
  );
  /* Whether the reply ever left the browser, so a broken-looking answer can
     be attributed to the client or to the (stubbed) server honestly. */
  log.saw(
    `Calls the app actually made for that first chat message: learnora-ai=${
      backend.callsTo("learnora-ai").length
    }, web-research=${backend.callsTo("web-research").length}; endpoints the mock never implemented so far: ${
      [...new Set(backend.unhandled)].join(", ") || "(none)"
    }`,
  );

  log.did("Used up today's chat too (backend.spendAiRequests(999, 'chat'))");
  backend.spendAiRequests(999, "chat");
  await safe(log, "send chat over the limit", async () => {
    const input = page.getByLabel("AI chat input");
    await input.fill("ok then just give me three facts about enzymes");
    await log.timed("chat send -> limit message", async () => {
      await input.press("Enter");
      await page.waitForTimeout(6000);
    });
  });
  await log.shot("chat-out-of-allowance");
  const chatLimitText =
    (await page
      .getByRole("log")
      .innerText()
      .then((t) => t.slice(0, 1400))
      .catch(() => "")) || (await log.visibleText(1800));
  log.saw(`Chat transcript when I'm out of chat allowance:\n${chatLimitText}`);
  log.saw(`Whole screen when out of allowance:\n${await log.visibleText(1000)}`);
  log.saw(
    `Out of allowance: learnora-ai calls so far=${backend.callsTo("learnora-ai").length} (of which today's log rows=${backend.aiRequestsToday("chat")})`,
  );
  log.saw(`Buttons offered when out of allowance: ${(await log.affordances()).join(" | ")}`);
  log.saw(
    `Is there an upgrade route from here? ${
      /plus|pro|upgrade/i.test(chatLimitText) ? "upgrade wording is on screen" : "no upgrade wording on screen"
    }`,
  );

  await safe(log, "close chat", async () => {
    await page.getByRole("button", { name: "Close AI chat" }).click();
  });

  /* ==================================================== B5. wifi drops */

  log.did("Going to Tasks, then turning the wifi off mid-use");
  await safe(log, "open tasks", async () => {
    await page.goto("tasks");
    await page.waitForLoadState("networkidle").catch(() => {});
  });
  await page.context().setOffline(true);
  await page.waitForTimeout(2000);
  await log.shot("offline-banner");
  const offlineText = await log.visibleText(1200);
  log.saw(`Right after the wifi died:\n${offlineText}`);
  log.saw(
    `Does it tell me I'm offline? ${
      /offline/i.test(offlineText) ? "yes, the word 'offline' is on screen" : "no 'offline' wording on screen"
    }`,
  );

  log.did("Adding a task anyway, because I want to remember to revise chem");
  await safe(log, "add task offline", async () => {
    const input = page.getByLabel("New Task Input");
    await input.fill("Revise chem equations");
    await input.press("Enter");
    await page.waitForTimeout(3000);
  });
  await log.shot("offline-task-added");
  const afterAdd = await log.visibleText(1400);
  log.saw(`After adding a task with no wifi:\n${afterAdd}`);
  log.saw(
    `Was I told my work is saved? ${
      /waiting to sync|will sync|queued|saved/i.test(afterAdd)
        ? "yes, sync/queued wording on screen"
        : "no sync/queued/saved wording on screen"
    }`,
  );
  log.saw(
    `Is my task visible in the list? ${
      afterAdd.includes("Revise chem equations") ? "yes" : "no"
    }`,
  );

  /* No page.goto while offline: the dev server is the origin, so a navigation
     would fail at the network layer and blank the app — a harness artifact,
     not something a deployed app would do. Everything below stays in the SPA. */
  log.did("Trying an AI thing while offline too, without leaving the page (⌘K → ai:)");
  await safe(log, "offline AI attempt", async () => {
    await openChatAndAsk(page, "quick summary of ionic bonding");
    await page.waitForTimeout(6000);
  });
  await log.shot("offline-ai-attempt");
  log.saw(
    `AI attempt with no wifi — transcript: ${await page
      .getByRole("log")
      .innerText()
      .then((t) => t.replace(/\s+/g, " ").slice(-600))
      .catch(() => "(no transcript)")}`,
  );
  log.saw(`Whole screen during the offline AI attempt:\n${await log.visibleText(900)}`);
  await safe(log, "close chat after offline attempt", async () => {
    await page.getByRole("button", { name: "Close AI chat" }).click();
  });

  log.did("Wifi comes back");
  await page.context().setOffline(false);
  await page.waitForTimeout(6000);
  await log.shot("back-online");
  const recovered = await log.visibleText(1200);
  log.saw(`~6s after reconnecting, without refreshing:\n${recovered}`);
  log.saw(
    `Did the offline banner clear itself? ${
      /offline/i.test(recovered) ? "no, still says offline" : "yes, no offline wording anymore"
    }`,
  );

  await safe(log, "check task survived", async () => {
    await page.goto("tasks");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);
    const tasks = await log.visibleText(1400);
    log.saw(
      `Back on Tasks after reconnect, is my task there? ${
        tasks.includes("Revise chem equations") ? "yes" : "no — it is gone"
      }`,
    );
    log.saw(`Tasks screen after reconnect:\n${tasks}`);
  });
  await log.shot("after-reconnect-tasks");

  /* ================================================== C. on my actual phone */

  log.did("Switching to my phone (393x852) and reloading so the app re-mounts");
  await page.setViewportSize(PHONE);
  await safe(log, "reload at phone size", async () => {
    await page.goto("/app/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
  });

  const screens: { name: string; path: string }[] = [
    { name: "Today", path: "/app/" },
    { name: "Library", path: "/app/library" },
    { name: "Plan", path: "/app/plan" },
    { name: "Focus", path: "/app/timer" },
    { name: "Progress", path: "/app/analytics" },
    { name: "Study Lab", path: "/app/study" },
    { name: "Study Lab tool — Step-by-step solver", path: "/app/solver" },
  ];

  for (const screen of screens) {
    await safe(log, `phone check ${screen.name}`, async () => {
      log.did(`Phone: opening ${screen.name}`);
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2000);
      await log.shot(`phone-${screen.name}`);

      const overflow = await hasHorizontalOverflow(page);
      const { all, inViewport } = await onScreenUndersized(page);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      log.saw(
        `PHONE ${screen.name}: horizontalOverflow=${overflow} (scrollWidth ${metrics.scrollWidth} vs clientWidth ${metrics.clientWidth}); undersizedTapTargets(raw)=${all.length}, of which actually on screen=${inViewport.length}`,
      );
      if (all.length) {
        log.saw(
          `PHONE ${screen.name} raw offenders: ${all
            .map((o) => `"${o.label}" ${o.width}x${o.height}`)
            .join(" | ")}`,
        );
        log.saw(
          `PHONE ${screen.name} offenders a thumb can reach: ${
            inViewport.map((o) => `"${o.label}" ${o.width}x${o.height}`).join(" | ") || "(none)"
          }`,
        );
      }
      log.saw(`PHONE ${screen.name} text: ${await log.visibleText(500)}`);
    });
  }

  /* ------------------------------------------------- C7. phone navigation */

  log.did("Phone: trying to get from this screen to another area");
  await safe(log, "phone navigation", async () => {
    await page.goto("/app/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);

    const beforeNav = await log.affordances();
    log.saw(`Phone: what's visible before I open any menu: ${beforeNav.join(" | ")}`);
    log.saw(
      `Is a nav link like "Library" already reachable without a menu? ${await page
        .getByRole("link", { name: "Library" })
        .first()
        .isVisible()
        .then((v) => (v ? "yes" : "no"))
        .catch(() => "no")}`,
    );

    const menu = page.getByRole("button", { name: /menu|navigation|open sidebar/i }).first();
    const menuVisible = await menu.isVisible().catch(() => false);
    log.saw(`Is there a hamburger/menu button? ${menuVisible ? "yes" : "no"}`);
    if (menuVisible) {
      const box = await menu.boundingBox();
      log.saw(
        `Menu button label="${await menu.getAttribute("aria-label")}" size=${Math.round(
          box?.width ?? 0,
        )}x${Math.round(box?.height ?? 0)}`,
      );
      await menu.click();
      await page.waitForTimeout(1000);
      await log.shot("phone-drawer-open");
      log.saw(`Drawer contents: ${(await log.affordances()).join(" | ")}`);

      for (const area of ["Today", "Library", "Plan", "Focus", "Progress", "Study Lab", "Settings"]) {
        const link = page.getByRole("link", { name: area, exact: true }).first();
        const visible = await link.isVisible().catch(() => false);
        const box = visible ? await link.boundingBox() : null;
        log.saw(
          `Drawer link "${area}": ${visible ? `reachable, ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}` : "NOT visible in the drawer"}`,
        );
      }

      await safe(log, "expand Account in the drawer", async () => {
        await page.getByRole("button", { name: "Expand Account" }).click();
        await page.waitForTimeout(600);
        log.saw(
          `After tapping "Expand Account", is Settings there? ${
            (await page
              .getByRole("link", { name: "Settings", exact: true })
              .first()
              .isVisible()
              .catch(() => false))
              ? "yes"
              : "still no"
          }`,
        );
      });

      log.saw(
        `Drawer overflow=${await hasHorizontalOverflow(page)}; undersized in drawer=${JSON.stringify(
          (await undersizedTapTargets(page)).map((o) => `${o.label} ${o.width}x${o.height}`),
        ).slice(0, 700)}`,
      );

      await page.getByRole("link", { name: "Library", exact: true }).first().click();
      await page.waitForTimeout(1500);
      log.saw(`After tapping Library in the drawer I'm on: ${new URL(page.url()).pathname}`);
      log.saw(
        `Did the drawer close by itself? ${
          (await page
            .getByRole("link", { name: "Settings", exact: true })
            .first()
            .isVisible()
            .catch(() => false))
            ? "no, nav links still on screen"
            : "yes"
        }`,
      );
      await log.shot("phone-after-drawer-nav");
    }
  });

  /* ------------------------------------------------- C8. typing on a phone */

  log.did("Phone: typing into the solver's box, like I would with the keyboard up");
  await safe(log, "phone typing in solver", async () => {
    await page.goto("/app/solver");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);

    const field = page.getByTestId("mistake-input");
    await field.click();
    await field.type("i dont get why the equation doesnt balance when i add oxygen", {
      delay: 10,
    });
    await page.waitForTimeout(500);

    const box = await field.boundingBox();
    log.saw(
      `Solver input box after typing: ${Math.round(box?.width ?? 0)}x${Math.round(
        box?.height ?? 0,
      )} at y=${Math.round(box?.y ?? 0)} (viewport height ${PHONE.height})`,
    );
    log.saw(`Still in view? ${(box?.y ?? 0) >= 0 && (box?.y ?? 0) < PHONE.height ? "yes" : "no"}`);
    log.saw(`Overflow while typing: ${await hasHorizontalOverflow(page)}`);

    /* Half the screen gone to a keyboard — the honest phone test is whether
       the field and its submit button both survive a 400px-tall window. */
    await page.setViewportSize({ width: PHONE.width, height: 420 });
    await page.waitForTimeout(800);
    await log.shot("phone-keyboard-squeeze");
    const squeezed = await field.boundingBox();
    const submit = await page.getByTestId("diagnose-submit-btn").boundingBox();
    log.saw(
      `With the keyboard up (window 393x420): input at y=${Math.round(
        squeezed?.y ?? 0,
      )}, submit button at y=${Math.round(submit?.y ?? -1)}; overflow=${await hasHorizontalOverflow(
        page,
      )}`,
    );
    log.saw(
      `Can I see the submit button without scrolling? ${
        (submit?.y ?? 9999) < 420 ? "yes" : "no, it is below the fold"
      }`,
    );
    await page.setViewportSize(PHONE);
  });

  await safe(log, "phone chat input", async () => {
    log.did("Phone: trying to open the chat and type in it");
    await page.goto("/app/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    const opener = page.getByRole("button", { name: "Search and command palette" }).first();
    log.saw(
      `Phone: is the ⌘K palette button (the only route to chat) visible without opening the drawer? ${
        (await opener.isVisible().catch(() => false)) ? "yes" : "no"
      }`,
    );
    if (await opener.isVisible().catch(() => false)) {
      await openChatAndAsk(page, "does this box fit on my phone");
      await page.waitForTimeout(3000);
      await log.shot("phone-chat");
      const input = page.getByLabel("AI chat input");
      await input.fill("does this box fit on my phone");
      const box = await input.boundingBox();
      log.saw(
        `PHONE chat input: ${Math.round(box?.width ?? 0)}x${Math.round(
          box?.height ?? 0,
        )} at x=${Math.round(box?.x ?? 0)}, y=${Math.round(box?.y ?? 0)}; viewport 393x852`,
      );
      log.saw(`PHONE chat overflow=${await hasHorizontalOverflow(page)}`);
      const panelBox = await page
        .getByRole("region", { name: "Learnora AI chat" })
        .boundingBox();
      log.saw(
        `PHONE chat panel: ${Math.round(panelBox?.width ?? 0)}x${Math.round(
          panelBox?.height ?? 0,
        )} at x=${Math.round(panelBox?.x ?? 0)}`,
      );
      log.saw(
        `PHONE chat undersized targets: ${JSON.stringify(
          (await undersizedTapTargets(page)).map((o) => `${o.label} ${o.width}x${o.height}`),
        ).slice(0, 800)}`,
      );
    } else {
      log.saw("Phone: could not find the dashboard tab that holds the chat opener");
    }
  });

  } finally {
    flush();
  }
});
