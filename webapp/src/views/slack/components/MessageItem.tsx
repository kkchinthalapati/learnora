import { useState, type ReactNode } from "react";
import type { SlackMessage, SlackUser } from "../../../lib/slack/slackStore";
import { renderMarkdownNodes } from "../../../lib/markdownToReact";
import { EmojiPicker } from "./EmojiPicker";
import { MessageSquareIcon, SmileIcon } from "./icons";
import styles from "../slackWorkspace.module.css";

export interface MessageItemProps {
  message: SlackMessage;
  author?: SlackUser;
  currentUserId: string;
  onReplyInThread?: (message: SlackMessage) => void;
  onToggleReaction?: (params: { messageId: string; emoji: string; userId: string }) => void;
  isThreadRoot?: boolean;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatRelativeReplyTime(iso?: string): string {
  if (!iso) return "";
  try {
    const now = Date.now();
    const diff = Math.floor((now - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatTime(iso);
  } catch {
    return "";
  }
}

function renderFormattedContent(content: string): ReactNode {
  // If the message contains markdown formatting (headers, bold, lists, code fences, etc.)
  const hasMarkdown = /```|`[^`]+`|\*\*|__|^\s*[-*+]\s|^\s*\d+\.\s|^\s*#{1,6}\s|\[.+\]\(.+\)/m.test(content);

  // If there are @mentions, highlight them nicely
  const mentionRegex = /(@K AI|@N AI|@Karthik|@Nirav)/g;

  if (hasMarkdown) {
    // Process markdown with renderMarkdownNodes
    const nodes = renderMarkdownNodes(content);
    return <div className={styles.markdownWrapper}>{nodes}</div>;
  }

  // Split on @mentions to highlight them as Slack pills
  const tokens = content.split(mentionRegex);
  return tokens.map((tok, idx) => {
    if (tok === "@K AI" || tok === "@N AI") {
      return (
        <span key={idx} className={styles.mentionPillAi}>
          {tok}
        </span>
      );
    }
    if (tok === "@Karthik" || tok === "@Nirav") {
      return (
        <span key={idx} className={styles.mentionPillFounder}>
          {tok}
        </span>
      );
    }
    return tok;
  });
}

function getAvatarColor(authorId: string): string {
  switch (authorId) {
    case "karthik":
      return "#0f766e";
    case "nirav":
      return "#2563eb";
    case "agent-k":
      return "#7c3aed";
    case "agent-n":
      return "#d97706";
    default:
      return "#4b5563";
  }
}

export function MessageItem({
  message,
  author,
  currentUserId,
  onReplyInThread,
  onToggleReaction,
  isThreadRoot = false,
}: MessageItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const authorName = author?.name || (message.authorId === "karthik" ? "Karthik" : message.authorId === "nirav" ? "Nirav" : message.authorId === "agent-k" ? "K AI" : message.authorId === "agent-n" ? "N AI" : message.authorId);
  const isAi = author?.role === "ai_advisor" || message.authorId === "agent-k" || message.authorId === "agent-n";
  const roleBadge = isAi ? "AI Advisor" : "Founder";
  const avatarBg = getAvatarColor(message.authorId);
  const avatarLetter = authorName ? authorName[0].toUpperCase() : "U";

  const handleSelectEmoji = (emoji: string) => {
    if (onToggleReaction) {
      onToggleReaction({
        messageId: message.id,
        emoji,
        userId: currentUserId,
      });
    }
  };

  return (
    <div
      className={`${styles.messageRow} ${isThreadRoot ? styles.threadRootMessage : ""}`}
      data-message-id={message.id}
    >
      {/* 36x36 Avatar */}
      <div
        className={styles.messageAvatar}
        style={{ backgroundColor: avatarBg }}
        aria-hidden="true"
      >
        {avatarLetter}
      </div>

      <div className={styles.messageBody}>
        {/* Author Header */}
        <div className={styles.messageAuthorHeader}>
          <span className={styles.messageAuthorName}>{authorName}</span>
          <span className={isAi ? styles.messageRoleBadgeAi : styles.messageRoleBadgeFounder}>
            {roleBadge}
          </span>
          <time className={styles.messageTimestamp} dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
          {message.providerUsed && (
            <span className={styles.providerTag} title={`Generated via ${message.providerUsed}`}>
              {message.providerUsed}
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className={styles.messageContent}>
          {renderFormattedContent(message.content)}
        </div>

        {/* Reaction Chips Row */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={styles.reactionChipsRow} aria-label="Reactions">
            {message.reactions.map((reaction) => {
              const isReactedByMe = reaction.users.includes(currentUserId);
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  className={`${styles.reactionChip} ${isReactedByMe ? styles.reactionChipActive : ""}`}
                  onClick={() =>
                    onToggleReaction?.({
                      messageId: message.id,
                      emoji: reaction.emoji,
                      userId: currentUserId,
                    })
                  }
                  aria-label={`${reaction.emoji} ${reaction.count} reactions`}
                  title={`${reaction.users.join(", ")} reacted with ${reaction.emoji}`}
                >
                  <span className={styles.reactionEmoji}>{reaction.emoji}</span>
                  <span className={styles.reactionCount}>{reaction.count}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={styles.addReactionChip}
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title="Add reaction"
              aria-label="Add reaction"
            >
              +
            </button>
          </div>
        )}

        {/* Thread Replies Indicator */}
        {!isThreadRoot && message.replyCount && message.replyCount > 0 ? (
          <button
            type="button"
            className={styles.threadReplyIndicator}
            onClick={() => onReplyInThread?.(message)}
            aria-label={`View ${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}`}
          >
            <span className={styles.threadArrow}>↳</span>
            <span className={styles.threadRepliesCount}>
              {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            </span>
            {message.lastReplyAt && (
              <span className={styles.threadLastReply}>
                · Last reply {formatRelativeReplyTime(message.lastReplyAt)}
              </span>
            )}
          </button>
        ) : null}
      </div>

      {/* Floating Hover Action Bar */}
      <div className={styles.messageActionBar} role="toolbar" aria-label="Message actions">
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          title="Add reaction"
          aria-label="Add reaction"
        >
          <SmileIcon />
        </button>

        {!isThreadRoot && onReplyInThread && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => onReplyInThread(message)}
            title="Reply in thread"
            aria-label="Reply in thread"
          >
            <MessageSquareIcon />
          </button>
        )}
      </div>

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <EmojiPicker
          isOpen={showEmojiPicker}
          onSelectEmoji={handleSelectEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
}
