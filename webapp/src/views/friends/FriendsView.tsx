import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { inviteLinkFor } from "../../api/friends";
import {
  useFriendRequests,
  useFriendsLeaderboard,
  useMyFriendCode,
  useRegenerateFriendCode,
  useRemoveFriend,
  useRespondToFriendRequest,
} from "../../hooks/useFriends";
import type { FriendRequest, LeaderboardEntry } from "../../api/types";
import {
  displayName,
  findClosestPaceFriend,
  initials,
  leaderboardMeta,
} from "./friendMeta";
import styles from "./friends.module.css";

/* The Friends hub: your invite link, pending requests either way, and a
 * leaderboard of everyone who has accepted.
 *
 * No <h1> here — the app shell's Header already renders one from the route
 * (lib/sectionLabel.ts), and the redesign audit removed the five views that
 * duplicated it. PageHeader's title is deliberately *not* "Friends" for the
 * same reason: it names the thing below it, not the page. */

function Avatar({ name }: { name: string | null }) {
  // aria-hidden: the initials restate the name that is already in the row's
  // text, so a screen reader would otherwise announce "AK Ada King".
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function InviteCard() {
  const { data: code, isPending, isError, error } = useMyFriendCode();
  const regenerate = useRegenerateFriendCode();
  const { showToast } = useToast();
  const { confirm } = useDialog();

  const link = code ? inviteLinkFor(code) : "";

  async function copyLink() {
    /* Clipboard access is origin- and permission-gated, and absent entirely
       over plain http — so a failure here is expected, not exceptional. The
       link stays selectable in the field either way. */
    if (!navigator.clipboard?.writeText) {
      showToast("Copying is not available here — select the link instead.", {
        error: true,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast("Copied!");
    } catch {
      showToast("Could not copy — select the link instead.", { error: true });
    }
  }

  async function onRegenerate() {
    const ok = await confirm(
      "Your current link stops working straight away, including for anyone you have already sent it to. Requests you have already accepted are not affected.",
      { title: "Generate a new link?", confirmText: "Generate", danger: true },
    );
    if (!ok) return;
    regenerate.mutate(undefined, {
      onSuccess: () => showToast("New invite link ready."),
      onError: (err: Error) =>
        showToast(`Could not generate a new link. ${err.message}`, {
          error: true,
        }),
    });
  }

  return (
    <Card variant="panel" padding="lg" as="section" aria-labelledby="invite-h">
      <h2 className={styles.sectionTitle} id="invite-h">
        Your invite link
      </h2>
      {isPending ? (
        <Skeleton label="Loading your invite link" height={44} />
      ) : isError ? (
        <p role="alert">
          Could not load your invite link. {(error as Error).message}
        </p>
      ) : !code ? (
        <p role="alert">
          Your profile is still being set up — reload in a moment to get your
          invite link.
        </p>
      ) : (
        <>
          <div className={styles.inviteRow}>
            {/* readOnly rather than disabled: a disabled input can't be
                focused or selected, which is the manual fallback when the
                clipboard API is unavailable. */}
            <input
              className={styles.linkField}
              value={link}
              readOnly
              aria-label="Your friend invite link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="primary" onClick={() => void copyLink()}>
              Copy link
            </Button>
            <Button
              onClick={() => void onRegenerate()}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? "Generating…" : "New link"}
            </Button>
          </div>
          <p className={styles.inviteHint}>
            Anyone who opens this link can ask to be your friend. Nothing is
            shared until you accept.
          </p>
        </>
      )}
    </Card>
  );
}

function RequestRow({ request }: { request: FriendRequest }) {
  const respond = useRespondToFriendRequest();
  const remove = useRemoveFriend();
  const { showToast } = useToast();
  const name = displayName(request.full_name);
  const busy = respond.isPending || remove.isPending;

  function onRespond(accept: boolean) {
    respond.mutate(
      { requestId: request.friendship_id, accept },
      {
        onSuccess: () =>
          showToast(accept ? `You and ${name} are now friends.` : "Declined."),
        onError: (err: Error) =>
          showToast(`Could not respond. ${err.message}`, { error: true }),
      },
    );
  }

  function onWithdraw() {
    remove.mutate(request.friendship_id, {
      onSuccess: () => showToast("Request withdrawn."),
      onError: (err: Error) =>
        showToast(`Could not withdraw. ${err.message}`, { error: true }),
    });
  }

  return (
    <Card variant="row" className={styles.personRow}>
      <Avatar name={request.full_name} />
      <div className={styles.personMain}>
        <p className={styles.personName}>{name}</p>
        <p className={styles.personMeta}>
          {request.direction === "incoming"
            ? "Wants to be your friend"
            : "Request sent — waiting for them"}
        </p>
      </div>
      <div className={styles.personActions}>
        {request.direction === "incoming" ? (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => onRespond(true)}
            >
              Accept
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onRespond(false)}>
              Decline
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={onWithdraw}>
            Withdraw
          </Button>
        )}
      </div>
    </Card>
  );
}

function RequestsSection() {
  const { data: requests, isPending, isError, error } = useFriendRequests();

  if (isPending) return null;
  if (isError) {
    return (
      <Card variant="panel" padding="lg" as="section">
        <p role="alert">
          Could not load friend requests. {(error as Error).message}
        </p>
      </Card>
    );
  }
  // Nothing pending is the steady state — an empty panel every day would be
  // noise, so the whole section only exists when it has something to say.
  if (requests.length === 0) return null;

  return (
    <Card
      variant="panel"
      padding="lg"
      as="section"
      aria-labelledby="requests-h"
    >
      <h2 className={styles.sectionTitle} id="requests-h">
        Requests
      </h2>
      <ul>
        {requests.map((request) => (
          <li key={request.friendship_id}>
            <RequestRow request={request} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LeaderboardRow({
  entry,
  isClosestPace,
}: {
  entry: LeaderboardEntry;
  isClosestPace?: boolean;
}) {
  const remove = useRemoveFriend();
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const name = displayName(entry.full_name);

  async function onRemove() {
    if (!entry.friendship_id) return;
    const friendshipId = entry.friendship_id;
    const ok = await confirm(
      `${name} will no longer see your focus time, and you will not see theirs.`,
      { title: `Remove ${name}?`, confirmText: "Remove", danger: true },
    );
    if (!ok) return;

    remove.mutate(friendshipId, {
      onSuccess: () => showToast(`Removed ${name}.`),
      onError: (err: Error) =>
        showToast(`Could not remove. ${err.message}`, { error: true }),
    });
  }

  return (
    <Card
      variant="row"
      className={`${styles.personRow} ${entry.is_self ? styles.selfRow : ""}`}
    >
      <span className={styles.rank}>{entry.rank}</span>
      <Avatar name={entry.full_name} />
      <div className={styles.personMain}>
        <p className={styles.personName}>
          {name}
          {entry.is_self ? <span className={styles.youTag}>You</span> : null}
          {!entry.is_self && isClosestPace ? (
            <span className={styles.paceTag}>Closest pace</span>
          ) : null}
        </p>
        <p className={styles.personMeta}>
          {leaderboardMeta(entry.weekly_minutes, entry.streak)}
        </p>
      </div>
      {entry.is_self ? null : (
        <div className={styles.personActions}>
          <Button
            size="sm"
            disabled={remove.isPending}
            onClick={() => void onRemove()}
          >
            Remove
          </Button>
        </div>
      )}
    </Card>
  );
}

function LeaderboardSection() {
  const { data: entries, isPending, isError, error } = useFriendsLeaderboard();

  const friends = entries?.filter((e) => !e.is_self) ?? [];
  const closest = friends.length > 1 && entries ? findClosestPaceFriend(entries) : null;

  return (
    <Card variant="panel" padding="lg" as="section" aria-labelledby="board-h">
      <h2 className={styles.sectionTitle} id="board-h">
        This week
      </h2>
      {isPending ? (
        <Skeleton label="Loading the leaderboard" height={120} />
      ) : isError ? (
        <p role="alert">
          Could not load the leaderboard. {(error as Error).message}
        </p>
      ) : /* One entry means the only person on the board is you — the RPC
             always returns the caller, so this is the real "no friends yet"
             case rather than a zero-length list. */
      entries.filter((e) => !e.is_self).length === 0 ? (
        <EmptyState
          icon="users"
          title="No friends yet"
          message="Send someone your invite link. Once they accept, you will both show up here with this week's focus time."
        />
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.user_id}>
              <LeaderboardRow
                entry={entry}
                isClosestPace={closest?.user_id === entry.user_id}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FriendsView() {
  return (
    <div className={styles.view}>
      <PageHeader
        title="Your study circle"
        sub="Compare focus time with people you actually study with. Only accepted friends can see your minutes and streak."
      />
      <InviteCard />
      <RequestsSection />
      <LeaderboardSection />
    </div>
  );
}
