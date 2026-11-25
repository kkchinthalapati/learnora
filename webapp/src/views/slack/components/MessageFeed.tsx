import { useEffect, useRef } from "react";
import type { SlackChannel, SlackMessage, SlackUser } from "../../../lib/slack/slackStore";
import { MessageItem } from "./MessageItem";
import { MessageComposer } from "./MessageComposer";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useSlackThinking } from "../../../lib/slack/aiDispatcher";
import styles from "../slackWorkspace.module.css";

export interface MessageFeedProps {
  channel: SlackChannel;
  messages: SlackMessage[];
  users: SlackUser[];
  currentUserId: string;
  onReplyInThread: (message: SlackMessage) => void;
  onToggleReaction: (params: { messageId: string; emoji: string; userId: string }) => void;
  onSendMessage: (content: string) => void;
}

function groupMessagesByDate(messages: SlackMessage[]): { dateLabel: string; items: SlackMessage[] }[] {
  const groups: { [dateKey: string]: SlackMessage[] } = {};
  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const dateKey = d.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(msg);
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  return Object.entries(groups).map(([dateKey, items]) => {
    const d = new Date(dateKey);
    let dateLabel = dateKey;
    if (d.toDateString() === now.toDateString()) {
      dateLabel = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      dateLabel = "Yesterday";
    } else {
      dateLabel = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    }
    return { dateLabel, items };
  });
}

export function MessageFeed({
  channel,
  messages,
  users,
  currentUserId,
  onReplyInThread,
  onToggleReaction,
  onSendMessage,
}: MessageFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeThinking = useSlackThinking(channel.id);

  // Auto-scroll on new message or thinking status change
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, activeThinking.length]);

  const dateGroups = groupMessagesByDate(messages);

  return (
    <section className={styles.mainFeed} aria-label={`#${channel.name} conversation`}>
      {/* Channel Header */}
      <header className={styles.channelHeader}>
        <div className={styles.channelHeaderLeft}>
          <h1 className={styles.channelHeaderTitle}>
            <span className={styles.hashSymbol}>#</span>
            {channel.name}
          </h1>
          <p className={styles.channelHeaderDesc}>{channel.description}</p>
        </div>
        <div className={styles.channelHeaderRight}>
          <div className={styles.memberAvatarStack}>
            {users.slice(0, 4).map((u) => (
              <div
                key={u.id}
                className={styles.stackedAvatar}
                title={`${u.name} (${u.role})`}
                style={{
                  backgroundColor: u.role === "ai_advisor" ? "#7c3aed" : "#0f766e",
                }}
              >
                {u.name[0]}
              </div>
            ))}
          </div>
          <span className={styles.membersCount}>{users.length} members</span>
        </div>
      </header>

      {/* Message Stream */}
      <div className={styles.messageStream}>
        {/* Welcome Hero for Channel */}
        <div className={styles.welcomeHero}>
          <div className={styles.welcomeHash}>#</div>
          <h2 className={styles.welcomeTitle}>Welcome to #{channel.name}!</h2>
          <p className={styles.welcomeText}>
            This is the start of the <strong>#{channel.name}</strong> channel, reserved exclusively
            for Karthik and Nirav.
          </p>
          <div className={styles.aiHintBox}>
            <div className={styles.aiHintTitle}>🤖 AI Co-Founders Ready:</div>
            <p className={styles.aiHintText}>
              Mention <code>@K AI</code> for Karthik&apos;s Strategy Advisor or <code>@N AI</code> for
              Nirav&apos;s Operations &amp; Risk Advisor to receive real-time automated insights.
            </p>
          </div>
        </div>

        {/* Date Grouped Messages */}
        {dateGroups.map((group) => (
          <div key={group.dateLabel} className={styles.dateGroupContainer}>
            <div className={styles.dateDivider}>
              <div className={styles.dateDividerLine} />
              <span className={styles.dateDividerLabel}>{group.dateLabel}</span>
              <div className={styles.dateDividerLine} />
            </div>

            <div className={styles.dateGroupMessages}>
              {group.items.map((msg) => {
                const author = users.find((u) => u.id === msg.authorId);
                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    author={author}
                    currentUserId={currentUserId}
                    onReplyInThread={onReplyInThread}
                    onToggleReaction={onToggleReaction}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* Reactive Thinking Indicators */}
        {activeThinking.map((item) => (
          <ThinkingIndicator key={item.id} persona={item.persona} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer at Bottom */}
      <div className={styles.composerWrapper}>
        <MessageComposer
          placeholder={`Message #${channel.name} (type @K AI or @N AI to consult)`}
          onSendMessage={onSendMessage}
        />
      </div>
    </section>
  );
}
