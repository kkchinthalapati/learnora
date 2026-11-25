import { useState } from "react";
import { Link } from "react-router";
import type { SlackChannel, SlackUser } from "../../../lib/slack/slackStore";
import { ChevronDownIcon, ChevronRightIcon, HashIcon } from "./icons";
import styles from "../slackWorkspace.module.css";

export interface SlackSidebarProps {
  channels: SlackChannel[];
  activeChannelId: string;
  users: SlackUser[];
  currentProfile: {
    id: string;
    name: string;
    role: string;
    email: string;
  };
  onSelectDm?: (user: SlackUser) => void;
}

export function SlackSidebar({
  channels,
  activeChannelId,
  users,
  currentProfile,
  onSelectDm,
}: SlackSidebarProps) {
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [dmsCollapsed, setDmsCollapsed] = useState(false);

  // Online count
  const onlineCount = users.filter((u) => u.isOnline).length;

  return (
    <aside className={styles.sidebar} aria-label="Channels and Direct Messages">
      {/* Workspace Header */}
      <header className={styles.sidebarHeader}>
        <div className={styles.workspaceHeaderInfo}>
          <h2 className={styles.workspaceTitle}>Learnora Founders</h2>
          <span className={styles.presencePill}>
            <span className={styles.onlineDot} /> {onlineCount} online
          </span>
        </div>
      </header>

      <div className={styles.sidebarScroll}>
        {/* Channels Section */}
        <section className={styles.navSection} aria-label="Channels">
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => setChannelsCollapsed((prev) => !prev)}
            aria-expanded={!channelsCollapsed}
          >
            <span className={styles.sectionChevron}>
              {channelsCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </span>
            <span className={styles.sectionTitle}>CHANNELS</span>
          </button>

          {!channelsCollapsed && (
            <ul className={styles.channelList}>
              {channels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                return (
                  <li key={channel.id}>
                    <Link
                      to={`/slack/${channel.id}`}
                      className={isActive ? styles.channelLinkActive : styles.channelLink}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className={styles.hashIcon}>
                        <HashIcon />
                      </span>
                      <span className={styles.channelName}>{channel.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Direct Messages Section */}
        <section className={styles.navSection} aria-label="Direct Messages">
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => setDmsCollapsed((prev) => !prev)}
            aria-expanded={!dmsCollapsed}
          >
            <span className={styles.sectionChevron}>
              {dmsCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </span>
            <span className={styles.sectionTitle}>DIRECT MESSAGES</span>
          </button>

          {!dmsCollapsed && (
            <ul className={styles.dmList}>
              {users.map((user) => {
                const isAi = user.role === "ai_advisor";
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      className={styles.dmButton}
                      onClick={() => onSelectDm?.(user)}
                      title={user.statusText || `${user.name} (${user.role})`}
                    >
                      <span
                        className={user.isOnline ? styles.onlineDot : styles.offlineDot}
                        aria-label={user.isOnline ? "Online" : "Offline"}
                      />
                      <span className={styles.dmName}>{user.name}</span>
                      {isAi && <span className={styles.aiBadge}>AI Advisor</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* User Profile Card at Bottom */}
      <footer className={styles.userProfileFooter}>
        <div className={styles.userAvatarSmall}>
          {currentProfile.name ? currentProfile.name[0].toUpperCase() : "U"}
        </div>
        <div className={styles.userMeta}>
          <div className={styles.userName}>{currentProfile.name}</div>
          <div className={styles.userRole}>{currentProfile.role} co-founder</div>
        </div>
      </footer>
    </aside>
  );
}
