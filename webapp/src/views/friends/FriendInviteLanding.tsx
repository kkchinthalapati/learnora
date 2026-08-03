import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";
import {
  useAddFriendByCode,
  useResolveFriendCode,
} from "../../hooks/useFriends";
import { displayName, initials } from "./friendMeta";
import styles from "./friends.module.css";

/* Where an invite link lands. Sits inside ProtectedRoute like every other
 * signed-in route, which is the whole auth story: a signed-out visitor is
 * bounced to /login with `state.from` set to this URL and comes straight back
 * here afterwards, so the link works for someone who has never opened the app
 * before without any new plumbing.
 *
 * Nothing is shared by arriving here. The code resolves to a name and an
 * avatar-less initial so the visitor knows who they are about to ask, and the
 * request is only sent when they press the button — per FRIENDS_FEATURE.md's
 * first assumption (request-and-accept, not instant-add). */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.landing}>
      <Card variant="elevated" padding="lg">
        <div className={styles.landingInner}>{children}</div>
      </Card>
    </div>
  );
}

function BackToFriends({ label = "Go to Friends" }: { label?: string }) {
  return (
    <div className={styles.landingActions}>
      <Link to="/friends">
        <Button variant="primary">{label}</Button>
      </Link>
    </div>
  );
}

export function FriendInviteLanding() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    data: profile,
    isPending,
    isError,
    error,
  } = useResolveFriendCode(code);
  const addFriend = useAddFriendByCode();

  function onConfirm() {
    addFriend.mutate(code, {
      onSuccess: (status) => {
        showToast(
          status === "accepted"
            ? `You and ${displayName(profile?.full_name)} are now friends.`
            : "Request sent. You will see them here once they accept.",
        );
        void navigate("/friends", { replace: true });
      },
      onError: (err: Error) =>
        showToast(`Could not send the request. ${err.message}`, {
          error: true,
        }),
    });
  }

  if (isPending) {
    return (
      <Shell>
        <Skeleton label="Checking this invite link" height={120} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <p role="alert">
          Could not check this invite link. {(error as Error).message}
        </p>
        <BackToFriends />
      </Shell>
    );
  }

  /* Null covers both a mistyped code and one that was rotated after the link
     was shared — indistinguishable from here, and deliberately so: telling a
     visitor which of the two it was would confirm whether a guessed code
     had ever existed. */
  if (!profile) {
    return (
      <Shell>
        <p className={styles.landingName}>This link is not valid</p>
        <p className={styles.landingSub}>
          It may have been mistyped, or the person may have generated a new one.
          Ask them for a fresh link.
        </p>
        <BackToFriends />
      </Shell>
    );
  }

  const name = displayName(profile.full_name);

  if (profile.is_self) {
    return (
      <Shell>
        <p className={styles.landingName}>This is your own link</p>
        <p className={styles.landingSub}>
          Share it with someone else and they can ask to be your friend.
        </p>
        <BackToFriends label="Back to Friends" />
      </Shell>
    );
  }

  if (profile.relationship === "accepted") {
    return (
      <Shell>
        <span
          className={`${styles.avatar} ${styles.landingAvatar}`}
          aria-hidden="true"
        >
          {initials(profile.full_name)}
        </span>
        <p className={styles.landingName}>You and {name} are already friends</p>
        <BackToFriends />
      </Shell>
    );
  }

  if (profile.relationship === "outgoing") {
    return (
      <Shell>
        <span
          className={`${styles.avatar} ${styles.landingAvatar}`}
          aria-hidden="true"
        >
          {initials(profile.full_name)}
        </span>
        <p className={styles.landingName}>Request already sent</p>
        <p className={styles.landingSub}>
          {name} has not answered yet. You will see them on your leaderboard
          once they accept.
        </p>
        <BackToFriends />
      </Shell>
    );
  }

  /* 'incoming' means they already asked you, so pressing the button here
     accepts rather than sending a second request in the other direction —
     request_or_accept_friend() collapses the pair server-side. */
  const isIncoming = profile.relationship === "incoming";

  return (
    <Shell>
      <span
        className={`${styles.avatar} ${styles.landingAvatar}`}
        aria-hidden="true"
      >
        {initials(profile.full_name)}
      </span>
      <p className={styles.landingName}>
        {isIncoming
          ? `${name} already asked to be your friend`
          : `Add ${name} as a friend?`}
      </p>
      <p className={styles.landingSub}>
        {isIncoming
          ? "Accepting means you will both see each other's weekly focus time and study streak."
          : `${name} will get a request. If they accept, you will both see each other's weekly focus time and study streak — nothing else.`}
      </p>
      <div className={styles.landingActions}>
        <Button
          variant="primary"
          disabled={addFriend.isPending}
          onClick={onConfirm}
        >
          {addFriend.isPending
            ? "Sending…"
            : isIncoming
              ? "Accept"
              : "Send request"}
        </Button>
        <Link to="/friends">
          <Button>Not now</Button>
        </Link>
      </div>
    </Shell>
  );
}
