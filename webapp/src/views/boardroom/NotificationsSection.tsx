import { useNavigate } from "react-router";
import { boardroomApi } from "../../api/boardroom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useBoardroomRefresh, useNotifications } from "../../hooks/useBoardroom";
import { formatTime, Titled } from "./shared";
import styles from "./boardroom.module.css";

export function NotificationsSection({ ws }: { ws: string }) {
  const q = useNotifications(ws);
  const refresh = useBoardroomRefresh(ws);
  const navigate = useNavigate();
  const unread = (q.data ?? []).filter((n) => !n.read_at);

  return (
    <div className={styles.main}>
      <Titled
        title="Notifications"
        sub="Inside the Boardroom only. Nothing is emailed or pushed."
        actions={
          <Button
            disabled={unread.length === 0}
            onClick={async () => {
              await boardroomApi.markRead(unread.map((n) => n.id));
              refresh();
            }}
          >
            Mark all read
          </Button>
        }
      />
      {q.isLoading ? <Skeleton height={160} /> : null}
      {q.data?.length === 0 ? <EmptyState icon="bell" title="Nothing yet" message="You will see mentions, prompts waiting for you, submitted answers and decisions here." /> : null}
      <ul className={styles.list}>
        {q.data?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={styles.listItem}
              style={{ width: "100%", textAlign: "left", font: "inherit", fontWeight: n.read_at ? 400 : 700 }}
              onClick={async () => {
                if (!n.read_at) await boardroomApi.markRead([n.id]).catch(() => undefined);
                refresh();
                if (n.link) navigate(n.link);
              }}
            >
              <span className={styles.itemTitle}>{n.title}</span>
              {n.body ? <span className={styles.muted}>{n.body}</span> : null}
              <span className={styles.meta}>
                {formatTime(n.created_at)}
                {n.read_at ? "" : " · unread"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
