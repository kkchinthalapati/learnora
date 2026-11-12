import { useEffect, useRef } from "react";
import type { SlackMessage, SlackUser } from "../../../lib/slack/slackStore";
import { MessageItem } from "./MessageItem";
import { MessageComposer } from "./MessageComposer";
import { CloseIcon } from "./icons";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useSlackThinking } from "../../../lib/slack/aiDispatcher";
import styles from "../slackWorkspace.module.css";

export interface ThreadPanelProps {
  rootMessage: SlackMessage;
  replies: SlackMessage[];
  users: SlackUser[];
  currentUserId: string;
  channelName: string;
  onClose: () => void;
  onSendReply: (content: string) => void;
  onToggleReaction: (params: { messageId: string; emoji: string; userId: string }) => void;
}

export function ThreadPanel({
  rootMessage,
  replies,
  users,
  currentUserId,
  channelName,
  onClose,
  onSendReply,
  onToggleReaction,
}: ThreadPanelProps) {
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const activeThreadThinking = useSlackThinking(rootMessage.channelId, rootMessage.id);

  // Auto-scroll to bottom of thread when a new reply arrives or thinking starts
  useEffect(() => {
    if (typeof repliesEndRef.current?.scrollIntoView === "function") {
      repliesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [replies.length, activeThreadThinking.length]);

  const rootAuthor = users.find((u) => u.id === rootMessage.authorId);

  return (
    <aside className={styles.threadPanel} aria-label={`Thread in #${channelName}`}>
      {/* Thread Header */}
      <header className={styles.threadHeader}>
        <div className={styles.threadHeaderLeft}>
          <h3 className={styles.threadTitle}>Thread</h3>
          <span className={styles.threadChannelSubtitle}>#{channelName}</span>
        </div>
        <button
          type="button"
          className={styles.threadCloseButton}
          onClick={onClose}
          aria-label="Close thread"
          title="Close thread"
        >
          <CloseIcon />
        </button>
      </header>

      {/* Thread Scrollable Content */}
      <div className={styles.threadScrollArea}>
        {/* Pinned Parent Message Card */}
        <div className={styles.threadPinnedRootCard}>
          <MessageItem
            message={rootMessage}
            author={rootAuthor}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
            isThreadRoot={true}
          />
        </div>

        {/* Replies Count Divider */}
        <div className={styles.threadRepliesDivider}>
          <div className={styles.threadDividerLine} />
          <span className={styles.threadDividerLabel}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <div className={styles.threadDividerLine} />
        </div>

        {/* Replies Stream */}
        <div className={styles.threadRepliesStream}>
          {replies.map((reply) => {
            const replyAuthor = users.find((u) => u.id === reply.authorId);
            return (
              <MessageItem
                key={reply.id}
                message={reply}
                author={replyAuthor}
                currentUserId={currentUserId}
                onToggleReaction={onToggleReaction}
                isThreadRoot={false}
              />
            );
          })}
          {/* Thread Thinking Indicators */}
          {activeThreadThinking.map((item) => (
            <ThinkingIndicator key={item.id} persona={item.persona} />
          ))}

          <div ref={repliesEndRef} />
        </div>
      </div>

      {/* Compact Thread Composer */}
      <div className={styles.threadComposerWrapper}>
        <MessageComposer
          placeholder="Reply in thread..."
          compact={true}
          onSendMessage={onSendReply}
        />
      </div>
    </aside>
  );
}
