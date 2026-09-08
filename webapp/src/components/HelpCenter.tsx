import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useOptionalChat } from "../context/chat";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Modal } from "./Modal";
import styles from "./HelpCenter.module.css";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const HELP_BY_ROUTE: ReadonlyArray<{
  matches: (path: string) => boolean;
  title: string;
  summary: string;
  suggestions: string[];
}> = [
  {
    matches: (path) => path === "/",
    title: "Dashboard",
    summary:
      "Your dashboard prioritises what to study next, not everything Learnora can do.",
    suggestions: [
      "Add an exam to start a countdown",
      "Open your next task",
      "Continue your latest notebook",
    ],
  },
  {
    matches: (path) =>
      path.startsWith("/library") || path.startsWith("/notebooks"),
    title: "Library workspace",
    summary:
      "Library stores individual resources. Notebooks connect several sources for cited questions and study outputs.",
    suggestions: [
      "Create a notebook for one subject",
      "Search across saved resources",
      "Turn material into flashcards or a quiz",
    ],
  },
  {
    matches: (path) =>
      ["/plan", "/my-week", "/tasks", "/exams"].some((route) =>
        path.startsWith(route),
      ),
    title: "Planning",
    summary:
      "Availability describes when you can study; Study plan decides what goes into those hours.",
    suggestions: [
      "Set your realistic availability",
      "Ask AI to plan your week",
      "Add exam dates before generating a plan",
    ],
  },
  {
    matches: (path) => path.startsWith("/timer") || path.startsWith("/room"),
    title: "Focus sessions",
    summary:
      "Bind a session to a task or subject so progress, streaks, and recommendations stay accurate.",
    suggestions: [
      "Choose a task before starting",
      "Use a soundscape in Study Room",
      "Review the session when the timer ends",
    ],
  },
  {
    matches: (path) =>
      path.startsWith("/study-lab") ||
      path.startsWith("/sparring") ||
      path.startsWith("/feynman") ||
      path.startsWith("/debugger"),
    title: "Study Lab",
    summary:
      "Choose the exercise that matches your goal: explain, challenge, diagnose, or practise.",
    suggestions: [
      "Use Explain It Simply for understanding",
      "Use Sparring to defend an argument",
      "Use Find My Mistake to diagnose an error",
    ],
  },
];

const FALLBACK_HELP = {
  title: "Learnora help",
  summary:
    "Learnora connects planning, source-based learning, active recall, focus sessions, and progress in one workspace.",
  suggestions: [
    "Use Search to jump anywhere",
    "Ask Learnora AI for a next step",
    "Send feedback if something feels unclear",
  ],
};

export function HelpCenter() {
  const { pathname } = useLocation();
  const chat = useOptionalChat();
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const help = useMemo(
    () =>
      HELP_BY_ROUTE.find((entry) => entry.matches(pathname)) ?? FALLBACK_HELP,
    [pathname],
  );

  const askAi = (prompt: string) => {
    setOpen(false);
    chat?.compose(prompt);
  };

  const feedbackBody = encodeURIComponent(
    `What happened:\n\nWhat I expected:\n\nPage: ${window.location.href}\nBrowser: ${navigator.userAgent}`,
  );

  return (
    <>
      <IconButton
        aria-label="Help and support"
        title="Help and support"
        onClick={() => setOpen(true)}
      >
        <Icon name="help-circle" size={20} />
      </IconButton>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={help.title}
        subtitle={help.summary}
        closeOnOverlayClick
        contentClassName={styles.modal}
      >
        <section className={styles.section} aria-labelledby="help-next-title">
          <h3 id="help-next-title">Useful next steps</h3>
          <ul>
            {help.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionCard}
            onClick={() =>
              askAi(
                `Help me use Learnora on the ${help.title} page. Ask what I am trying to achieve, then guide me one step at a time.`,
              )
            }
          >
            <Icon name="brain" size={20} />
            <span>
              <strong>Ask Learnora AI</strong>
              <small>Get guidance for this page</small>
            </span>
          </button>
          <button
            type="button"
            className={styles.actionCard}
            onClick={() =>
              askAi(
                "Find me a few high-quality educational videos about my topic. Ask me for the topic and level first, then use web sources and link the videos.",
              )
            }
          >
            <Icon name="play" size={20} />
            <span>
              <strong>Find learning videos</strong>
              <small>Ask for videos on any topic</small>
            </span>
          </button>
        </div>

        <section className={styles.support}>
          <div>
            <strong>Install on mobile</strong>
            <p>
              {installPrompt
                ? "Install Learnora as an app from this device."
                : "Use your browser menu and choose Add to Home Screen for an app-like experience."}
            </p>
          </div>
          {installPrompt ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void installPrompt.prompt()}
            >
              Install
            </Button>
          ) : null}
        </section>

        <section className={styles.support}>
          <div>
            <strong>Something wrong or confusing?</strong>
            <p>
              Your page and browser are added automatically; never include
              passwords or private course material.
            </p>
          </div>
          <a
            className={styles.feedbackLink}
            href={`mailto:support@learnora.app?subject=${encodeURIComponent(`Learnora feedback: ${help.title}`)}&body=${feedbackBody}`}
          >
            Send feedback
          </a>
        </section>
      </Modal>
    </>
  );
}
