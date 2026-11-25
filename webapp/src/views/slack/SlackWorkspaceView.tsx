import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useDocumentTitle } from "../../lib/routeTitle";
import { useAuth } from "../../context/auth";
import { getFounderProfile } from "../../lib/founderAuth";
import {
  useSlackChannels,
  useSlackChannelMessages,
  useSlackThreadReplies,
  useSlackUsers,
  setActiveChannel,
  sendMessage,
  toggleReaction,
  type SlackMessage,
} from "../../lib/slack/slackStore";
import { WorkspaceRail } from "./components/WorkspaceRail";
import { SlackSidebar } from "./components/SlackSidebar";
import { MessageFeed } from "./components/MessageFeed";
import { ThreadPanel } from "./components/ThreadPanel";
import { useSlackAiDispatcher } from "../../lib/slack/aiDispatcher";
import "../../styles/founderWorkspace.css";
import styles from "./slackWorkspace.module.css";

export function SlackWorkspaceView() {
  const { channelId = "general" } = useParams<{ channelId?: string }>();
  const { user } = useAuth();
  const profile = getFounderProfile(user) ?? {
    id: "karthik",
    name: "Karthik" as const,
    role: "strategy" as const,
    email: "kk.chinthalapati@gmail.com",
    handle: "karthik" as const,
    title: "Co-Founder & Head of Strategy",
  };

  const channels = useSlackChannels();
  const users = useSlackUsers();

  const activeChannel = channels.find((c) => c.id === channelId) ?? {
    id: channelId,
    name: channelId,
    description: "Founder conversation channel",
    isPrivate: false,
  };

  useDocumentTitle(`Founders Slack · #${activeChannel.name}`);

  // Sync active channel to store
  useEffect(() => {
    setActiveChannel(activeChannel.id);
  }, [activeChannel.id]);

  const messages = useSlackChannelMessages(activeChannel.id);

  // Thread management
  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null);
  const threadReplies = useSlackThreadReplies(activeThreadRootId);

  // Root message for thread
  const activeThreadRootMessage = activeThreadRootId
    ? messages.find((m) => m.id === activeThreadRootId) || null
    : null;

  // AI background dispatcher
  const { dispatchMessage } = useSlackAiDispatcher();

  // Actions
  const handleSendMessage = (content: string) => {
    const newMsg = sendMessage({
      channelId: activeChannel.id,
      content,
      authorId: profile.id,
    });
    void dispatchMessage({
      userMessage: newMsg,
      channel: activeChannel,
    });
  };

  const handleOpenThread = (message: SlackMessage) => {
    setActiveThreadRootId(message.id);
  };

  const handleCloseThread = () => {
    setActiveThreadRootId(null);
  };

  const handleSendThreadReply = (content: string) => {
    if (!activeThreadRootId) return;
    const newMsg = sendMessage({
      channelId: activeChannel.id,
      content,
      authorId: profile.id,
      threadRootId: activeThreadRootId,
    });
    void dispatchMessage({
      userMessage: newMsg,
      channel: activeChannel,
      threadRootId: activeThreadRootId,
      threadRootMessage: activeThreadRootMessage || undefined,
    });
  };

  const handleToggleReaction = (params: {
    messageId: string;
    emoji: string;
    userId: string;
  }) => {
    toggleReaction(params);
  };

  return (
    <main className={styles.workspace} role="main" aria-label="Founders Slack Workspace">
      {/* Column 1: Workspace Switcher Rail (68px) */}
      <WorkspaceRail
        userName={profile.name}
        userRole={profile.role}
      />

      {/* Column 2: Channel & DM Sidebar (240px) */}
      <SlackSidebar
        channels={channels}
        activeChannelId={activeChannel.id}
        users={users}
        currentProfile={profile}
      />

      {/* Column 3: Main Channel Message Area */}
      <MessageFeed
        channel={activeChannel}
        messages={messages}
        users={users}
        currentUserId={profile.id}
        onReplyInThread={handleOpenThread}
        onToggleReaction={handleToggleReaction}
        onSendMessage={handleSendMessage}
      />

      {/* Column 4: Collapsible Thread Panel (~380px) */}
      {activeThreadRootMessage && (
        <ThreadPanel
          rootMessage={activeThreadRootMessage}
          replies={threadReplies}
          users={users}
          currentUserId={profile.id}
          channelName={activeChannel.name}
          onClose={handleCloseThread}
          onSendReply={handleSendThreadReply}
          onToggleReaction={handleToggleReaction}
        />
      )}
    </main>
  );
}
