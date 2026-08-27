import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../Icon";
import type { IconName } from "../icons";
import { useOptionalCommandPalette } from "../../context/commandPalette";
import { useOverlayBehavior } from "../../context/overlayStack";
import { useOptionalTimer } from "../../context/timer";
import { useAppearance } from "../../context/appearance";
import { useOptionalChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useAllDecks } from "../../hooks/useDecks";
import { tasksApi } from "../../api/tasks";
import { tasksKeys } from "../../hooks/useTasks";
import { resolveDark, THEME_KEY } from "../../lib/appearance";
import { Storage } from "../../lib/storage";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import styles from "./CommandPalette.module.css";

export interface CommandItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  icon: IconName;
  color?: string;
  badge?: string;
  shortcut?: string;
  keywords?: string[];
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const context = useOptionalCommandPalette();
  const isOpen = props.isOpen !== undefined ? props.isOpen : (context?.isOpen ?? false);
  const handleClose = props.onClose || context?.close || (() => {});

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const timer = useOptionalTimer();
  const timerRunning = timer?.state?.isRunning ?? false;
  const { appearance, setAppearance } = useAppearance();
  const chat = useOptionalChat();

  const isDark = resolveDark(appearance.mode);

  // Dynamic entity queries
  const { data: folders = [] } = useFolders();
  const { data: materials = [] } = useMaterials();
  const { data: decks = [] } = useAllDecks();

  // Overlay Stack & Focus Trap behavior
  useOverlayBehavior({
    ref: paletteRef,
    open: isOpen,
    onClose: handleClose,
    initialFocusRef: inputRef,
  });

  // Reset or initialize query when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery(context?.initialQuery ?? "");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen, context?.initialQuery]);

  // Parse prefixes: t:, task:, ?, ai:, debug:
  const trimmed = query.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  const prefixMatch = useMemo(() => {
    if (lowerTrimmed.startsWith("t:") || lowerTrimmed.startsWith("task:")) {
      const text = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      return { type: "task" as const, text };
    }
    if (lowerTrimmed.startsWith("?") || lowerTrimmed.startsWith("ai:")) {
      const sepIndex = trimmed.startsWith("?") ? 1 : trimmed.indexOf(":") + 1;
      const text = trimmed.slice(sepIndex).trim();
      return { type: "ai" as const, text };
    }
    if (lowerTrimmed.startsWith("debug:")) {
      const text = trimmed.slice(6).trim();
      return { type: "debug" as const, text };
    }
    return null;
  }, [trimmed, lowerTrimmed]);

  // Build items list
  const allItems = useMemo<CommandItem[]>(() => {
    // If a direct prefix command is detected, display its dedicated action first
    if (prefixMatch) {
      if (prefixMatch.type === "task") {
        return [
          {
            id: "action-prefix-task",
            category: "Task Action",
            title: prefixMatch.text ? `Create task: "${prefixMatch.text}"` : "Type a task name...",
            subtitle: "Add task to Task Manager and sync",
            icon: "list-checks",
            badge: "Task",
            shortcut: "↵",
            onSelect: async () => {
              if (!prefixMatch.text) return;
              try {
                await tasksApi.add(prefixMatch.text);
                await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
                showToast(`Task created: "${prefixMatch.text}"`);
                handleClose();
              } catch (err) {
                showToast("Failed to create task", { error: true });
              }
            },
          },
        ];
      }

      if (prefixMatch.type === "ai") {
        return [
          {
            id: "action-prefix-ai",
            category: "AI TurboChat",
            title: prefixMatch.text ? `Ask AI: "${prefixMatch.text}"` : "Type an AI prompt...",
            subtitle: "Send prompt directly into TurboChat",
            icon: "bot",
            badge: "AI Chat",
            shortcut: "↵",
            onSelect: () => {
              if (!prefixMatch.text) return;
              chat?.open();
              void chat?.send(prefixMatch.text);
              handleClose();
            },
          },
        ];
      }

      if (prefixMatch.type === "debug") {
        return [
          {
            id: "action-prefix-debug",
            category: "Cognitive Debugger",
            title: prefixMatch.text ? `Debug topic: "${prefixMatch.text}"` : "Type concept to debug...",
            subtitle: "Decompile misconception in Cognitive Root-Cause Debugger",
            icon: "brain",
            badge: "Debugger",
            shortcut: "↵",
            onSelect: () => {
              if (!prefixMatch.text) return;
              CognitiveBridge.setPayload({
                subject: "General",
                topic: prefixMatch.text,
                concept: prefixMatch.text,
                sourceTool: "notes",
                evidencePrompt: "Direct debug invocation from Command Palette",
                suggestedAction: "debug_stack",
              });
              navigate(`/debugger?topic=${encodeURIComponent(prefixMatch.text)}`);
              handleClose();
            },
          },
        ];
      }
    }

    const items: CommandItem[] = [];

    // --- Actions ---
    items.push({
      id: "action-timer-25",
      category: "Quick Actions",
      title: "Start 25m Timer",
      subtitle: "25-minute Pomodoro study focus block",
      icon: "clock",
      shortcut: "25m",
      keywords: ["pomodoro", "timer", "focus", "clock", "study", "25"],
      onSelect: () => {
        timer?.startPreset({ focus: 25 }, "pomodoro");
        showToast("Started 25m Pomodoro session");
        navigate("/timer");
        handleClose();
      },
    });

    items.push({
      id: "action-timer-50",
      category: "Quick Actions",
      title: "Start 50m Timer",
      subtitle: "50-minute Deep Work focus block",
      icon: "clock",
      shortcut: "50m",
      keywords: ["deep work", "timer", "focus", "50", "study"],
      onSelect: () => {
        timer?.startPreset({ focus: 50 }, "pomodoro");
        showToast("Started 50m Focus session");
        navigate("/timer");
        handleClose();
      },
    });

    items.push({
      id: "action-timer-toggle",
      category: "Quick Actions",
      title: timerRunning ? "Pause Timer" : "Toggle / Start Timer",
      subtitle: timerRunning ? "Pause the active study timer" : "Start or resume study timer",
      icon: timerRunning ? "pause" : "play",
      shortcut: "Timer",
      keywords: ["toggle", "pause", "resume", "start", "timer", "stop"],
      onSelect: () => {
        timer?.toggle();
        showToast(timerRunning ? "Timer paused" : "Timer started");
        handleClose();
      },
    });

    items.push({
      id: "action-toggle-theme",
      category: "Quick Actions",
      title: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
      subtitle: `Toggle appearance theme (currently ${isDark ? "Dark" : "Light"})`,
      icon: isDark ? "sun" : "moon",
      shortcut: "Theme",
      keywords: ["theme", "dark", "light", "mode", "color", "appearance"],
      onSelect: () => {
        const nextMode = isDark ? "light" : "dark";
        setAppearance({ mode: nextMode });
        Storage.set("learnora_mode", nextMode);
        Storage.set(THEME_KEY, nextMode);
        showToast(`Theme switched to ${nextMode} mode`);
        handleClose();
      },
    });

    // --- AI Instruments ---
    items.push({
      id: "nav-ai-debugger",
      category: "AI Instruments",
      title: "Cognitive Debugger",
      subtitle: "Decompile misconception stack traces and repair root causes",
      icon: "brain",
      badge: "AI Tool",
      keywords: ["ai", "debugger", "debug", "mistake", "fix", "concept", "trace"],
      onSelect: () => {
        navigate("/debugger");
        handleClose();
      },
    });

    items.push({
      id: "nav-ai-feynman",
      category: "AI Instruments",
      title: "Feynman Apprentice",
      subtitle: "Teach an AI apprentice to stress-test your comprehension",
      icon: "award",
      badge: "AI Tool",
      keywords: ["ai", "feynman", "teach", "apprentice", "comprehension", "studio"],
      onSelect: () => {
        navigate("/feynman");
        handleClose();
      },
    });

    items.push({
      id: "nav-ai-premortem",
      category: "AI Instruments",
      title: "Exam Pre-Mortem Radar",
      subtitle: "Adversarial failure prediction and syllabus stress-testing",
      icon: "shield",
      badge: "AI Tool",
      keywords: ["ai", "premortem", "pre-mortem", "radar", "exam", "failure", "stress"],
      onSelect: () => {
        navigate("/premortem");
        handleClose();
      },
    });

    items.push({
      id: "nav-ai-graph",
      category: "AI Instruments",
      title: "Concept Dependency Graph",
      subtitle: "Interactive visual knowledge map and prerequisite dependencies",
      icon: "share-2",
      badge: "AI Tool",
      keywords: ["graph", "concept", "knowledge", "nodes", "dependencies", "network"],
      onSelect: () => {
        navigate("/graph");
        handleClose();
      },
    });

    items.push({
      id: "nav-ai-analytics",
      category: "AI Instruments",
      title: "Study Analytics & Velocity",
      subtitle: "Focus time, cognitive load, and mastery trends",
      icon: "activity",
      badge: "AI Tool",
      keywords: ["analytics", "stats", "velocity", "charts", "metrics", "data"],
      onSelect: () => {
        navigate("/analytics");
        handleClose();
      },
    });

    // --- Navigation ---
    items.push({
      id: "nav-dashboard",
      category: "Navigation",
      title: "Dashboard",
      subtitle: "Study overview, goals, and daily streak",
      icon: "dashboard",
      keywords: ["home", "dashboard", "overview"],
      onSelect: () => {
        navigate("/");
        handleClose();
      },
    });

    items.push({
      id: "nav-tasks",
      category: "Navigation",
      title: "Task Manager",
      subtitle: "Manage tasks, deadlines, and to-do lists",
      icon: "list-checks",
      keywords: ["tasks", "todo", "list", "deadlines", "assignments"],
      onSelect: () => {
        navigate("/tasks");
        handleClose();
      },
    });

    items.push({
      id: "nav-exams",
      category: "Navigation",
      title: "Exams",
      subtitle: "Exam schedule, countdowns, and readiness",
      icon: "calendar",
      keywords: ["exams", "tests", "finals", "midterms"],
      onSelect: () => {
        navigate("/exams");
        handleClose();
      },
    });

    items.push({
      id: "nav-timer",
      category: "Navigation",
      title: "Focus Timer",
      subtitle: "Pomodoro, countdown, stopwatch, and flowtime",
      icon: "clock",
      keywords: ["timer", "pomodoro", "stopwatch", "clock", "focus"],
      onSelect: () => {
        navigate("/timer");
        handleClose();
      },
    });

    items.push({
      id: "nav-library",
      category: "Navigation",
      title: "Library",
      subtitle: "Browse all subjects, materials, and flashcards",
      icon: "layers",
      keywords: ["library", "materials", "documents", "decks", "subjects"],
      onSelect: () => {
        navigate("/library");
        handleClose();
      },
    });

    items.push({
      id: "nav-plan",
      category: "Navigation",
      title: "Study Plan",
      subtitle: "Weekly schedule and scheduled focus blocks",
      icon: "calendar",
      keywords: ["plan", "schedule", "weekly", "timetable"],
      onSelect: () => {
        navigate("/plan");
        handleClose();
      },
    });

    items.push({
      id: "nav-room",
      category: "Navigation",
      title: "Study Room",
      subtitle: "Live synchronized group study session",
      icon: "users",
      keywords: ["room", "group", "social", "study room", "live"],
      onSelect: () => {
        navigate("/room");
        handleClose();
      },
    });

    items.push({
      id: "nav-friends",
      category: "Navigation",
      title: "Friends & Community",
      subtitle: "Study buddies, peer rankings, and friend requests",
      icon: "users",
      keywords: ["friends", "community", "social", "leaderboard"],
      onSelect: () => {
        navigate("/friends");
        handleClose();
      },
    });

    items.push({
      id: "nav-settings",
      category: "Navigation",
      title: "Settings",
      subtitle: "Appearance, theme, AI persona, and account",
      icon: "settings",
      keywords: ["settings", "preferences", "account", "profile"],
      onSelect: () => {
        navigate("/settings");
        handleClose();
      },
    });

    // --- Dynamic: Subjects (Folders) ---
    folders.forEach((folder) => {
      items.push({
        id: `folder-${folder.id}`,
        category: "Subjects",
        title: folder.name,
        subtitle: "Subject Folder",
        icon: "folder",
        color: folder.color,
        badge: "Subject",
        keywords: ["subject", "folder", "course", folder.name],
        onSelect: () => {
          navigate(`/folders/${folder.id}`);
          handleClose();
        },
      });
    });

    // --- Dynamic: Notes & Documents (Materials) ---
    materials.forEach((mat) => {
      items.push({
        id: `material-${mat.id}`,
        category: "Notes & Documents",
        title: mat.title,
        subtitle: mat.type === "youtube" ? "Video Material" : "Document / Note",
        icon: "file-text",
        badge: "Material",
        keywords: ["material", "document", "notes", "file", "pdf", mat.title],
        onSelect: () => {
          navigate(`/notes/${mat.id}`);
          handleClose();
        },
      });
    });

    // --- Dynamic: Flashcard Decks ---
    decks.forEach((deck) => {
      items.push({
        id: `deck-${deck.id}`,
        category: "Flashcard Decks",
        title: deck.title,
        subtitle: "Flashcard Deck Review",
        icon: "layers",
        badge: "Deck",
        keywords: ["flashcards", "deck", "cards", "review", deck.title],
        onSelect: () => {
          navigate(`/review/${deck.id}`);
          handleClose();
        },
      });
    });

    return items;
  }, [
    prefixMatch,
    timerRunning,
    isDark,
    folders,
    materials,
    decks,
    navigate,
    handleClose,
    timer,
    setAppearance,
    showToast,
    chat,
    queryClient,
  ]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (prefixMatch) {
      return allItems;
    }

    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems;
    }

    return allItems.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(q) ?? false;
      const matchCategory = item.category.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
      return matchTitle || matchSubtitle || matchCategory || matchKeywords;
    });
  }, [allItems, prefixMatch, query]);

  // Reset selected index when query changes or bounds change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep selected item within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length && filteredItems.length > 0) {
      setSelectedIndex(filteredItems.length - 1);
    }
  }, [filteredItems.length, selectedIndex]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard navigation handler inside the dialog
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const currentItem = filteredItems[selectedIndex];
      if (currentItem) {
        void currentItem.onSelect();
      }
    }
  };

  if (!isOpen) return null;

  // Group items by category for visual organization
  const groupedItems: { category: string; items: { item: CommandItem; globalIndex: number }[] }[] = [];
  let currentIndex = 0;
  filteredItems.forEach((item) => {
    let group = groupedItems.find((g) => g.category === item.category);
    if (!group) {
      group = { category: item.category, items: [] };
      groupedItems.push(group);
    }
    group.items.push({ item, globalIndex: currentIndex });
    currentIndex++;
  });

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      data-testid="command-palette-overlay"
    >
      <div
        ref={paletteRef}
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label="Command Palette"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <span id={titleId} className="sr-only" style={{ display: "none" }}>
          Command Palette
        </span>

        {/* Search header bar */}
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Type a command, search, or prefix (t:, ai:, debug:)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands, notes, subjects, or actions"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <Icon name="x" size={16} />
            </button>
          ) : null}
          <span className={styles.escBadge} aria-hidden="true">
            ESC
          </span>
        </div>

        {/* Prefix shortcut quick bar */}
        {!query && (
          <div className={styles.prefixBar}>
            <span className={styles.prefixLabel}>Direct prefixes:</span>
            <button
              type="button"
              className={styles.prefixChip}
              onClick={() => {
                setQuery("t: ");
                inputRef.current?.focus();
              }}
            >
              <code>t:</code> Task
            </button>
            <button
              type="button"
              className={styles.prefixChip}
              onClick={() => {
                setQuery("ai: ");
                inputRef.current?.focus();
              }}
            >
              <code>ai:</code> Ask AI
            </button>
            <button
              type="button"
              className={styles.prefixChip}
              onClick={() => {
                setQuery("debug: ");
                inputRef.current?.focus();
              }}
            >
              <code>debug:</code> Debugger
            </button>
          </div>
        )}

        {/* Results List */}
        <ul
          ref={listRef}
          className={styles.resultsList}
          role="listbox"
          aria-label="Command palette results"
        >
          {filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="search" size={28} className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>No matching results</p>
              <p className={styles.emptyDesc}>
                No commands, subjects, or documents matched &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <li key={group.category} role="presentation">
                <div className={styles.sectionHeader}>{group.category}</div>
                {group.items.map(({ item, globalIndex }) => {
                  const isSelected = globalIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-index={globalIndex}
                      role="option"
                      aria-selected={isSelected}
                      className={`${styles.item} ${isSelected ? styles.selected : ""}`}
                      onClick={() => void item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <div className={styles.itemIcon}>
                        <Icon name={item.icon} size={16} />
                        {item.color && (
                          <span
                            className={styles.colorDot}
                            style={{ backgroundColor: item.color }}
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      <div className={styles.itemContent}>
                        <div className={styles.itemTitle}>{item.title}</div>
                        {item.subtitle && (
                          <div className={styles.itemSubtitle}>{item.subtitle}</div>
                        )}
                      </div>

                      <div className={styles.itemMeta}>
                        {item.badge && (
                          <span className={styles.badge}>{item.badge}</span>
                        )}
                        {item.shortcut ? (
                          <kbd className={styles.shortcutKbd}>{item.shortcut}</kbd>
                        ) : isSelected ? (
                          <kbd className={styles.shortcutKbd}>↵</kbd>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </li>
            ))
          )}
        </ul>

        {/* Footer shortcuts helper */}
        <div className={styles.footer}>
          <div className={styles.footerHints}>
            <span className={styles.hintItem}>
              <kbd className={styles.footerKbd}>↑</kbd>
              <kbd className={styles.footerKbd}>↓</kbd>
              <span>Navigate</span>
            </span>
            <span className={styles.hintItem}>
              <kbd className={styles.footerKbd}>↵</kbd>
              <span>Select</span>
            </span>
            <span className={styles.hintItem}>
              <kbd className={styles.footerKbd}>ESC</kbd>
              <span>Close</span>
            </span>
          </div>
          <div className={styles.footerHints}>
            <span className={styles.hintItem}>
              <kbd className={styles.footerKbd}>t:</kbd> New task
            </span>
            <span className={styles.hintItem}>
              <kbd className={styles.footerKbd}>ai:</kbd> Ask AI
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
