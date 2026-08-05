import { useCallback, useEffect, useState } from "react";
import { pushApi } from "../api/push";
import { isPushSupported, serializeSubscription } from "../lib/push";
import {
  getExistingPushSubscription,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/serviceWorker";
import type { PushSubscriptionRow } from "../api/types";

/* Push opt-in status for *this device*, not a TanStack Query resource: the
 * source of truth is the browser's own `PushSubscription` (there is no
 * "list my subscriptions" read the Settings page needs), and getting to it
 * is an imperative async sequence — service worker ready, then
 * `pushManager.getSubscription()` — not a cacheable server fetch. The row in
 * `push_subscriptions` is fetched only to read this device's saved toggle
 * preferences once a subscription is confirmed to exist. */

export type PushStatus =
  "unsupported" | "checking" | "subscribed" | "unsubscribed";

export function usePush() {
  const [status, setStatus] = useState<PushStatus>(
    isPushSupported() ? "checking" : "unsupported",
  );
  const [row, setRow] = useState<PushSubscriptionRow | null>(null);
  const [allSubscriptions, setAllSubscriptions] = useState<
    PushSubscriptionRow[]
  >([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const list = await pushApi.fetchAll();
      setAllSubscriptions(list);
    } catch (err) {
      console.error("Failed to fetch all subscriptions", err);
    }
  }, []);

  useEffect(() => {
    if (!isPushSupported()) return;
    let cancelled = false;
    void (async () => {
      void fetchAll();
      const existing = await getExistingPushSubscription();
      if (cancelled) return;
      if (!existing) {
        setStatus("unsubscribed");
        return;
      }
      try {
        const savedRow = await pushApi.fetchByEndpoint(existing.endpoint);
        if (cancelled) return;
        setRow(savedRow);
        setStatus("subscribed");
      } catch {
        if (!cancelled) setStatus("unsubscribed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const enable = useCallback(
    async (vapidPublicKey: string) => {
      setPending(true);
      setError(null);
      try {
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
        await registerServiceWorker();
        const subscription = await subscribeToPush(vapidPublicKey);
        const serialized = serializeSubscription(subscription);
        const savedRow = await pushApi.save({
          ...serialized,
          notifyExams: true,
          notifyFlashcards: true,
        });
        setRow(savedRow);
        setStatus("subscribed");
        void fetchAll();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not enable push notifications.",
        );
      } finally {
        setPending(false);
      }
    },
    [fetchAll],
  );

  const disable = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const existing = await getExistingPushSubscription();
      if (existing) await pushApi.remove(existing.endpoint).catch(() => {});
      await unsubscribeFromPush();
      setRow(null);
      setStatus("unsubscribed");
      void fetchAll();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not disable push notifications.",
      );
    } finally {
      setPending(false);
    }
  }, [fetchAll]);

  const updatePreferences = useCallback(
    async (
      prefs: Partial<{ notifyExams: boolean; notifyFlashcards: boolean }>,
    ) => {
      if (!row) return;
      const next = {
        ...row,
        ...(prefs.notifyExams !== undefined
          ? { notify_exams: prefs.notifyExams }
          : {}),
        ...(prefs.notifyFlashcards !== undefined
          ? { notify_flashcards: prefs.notifyFlashcards }
          : {}),
      };
      setRow(next);
      try {
        await pushApi.updatePreferences(row.endpoint, prefs);
      } catch (err) {
        setRow(row);
        setError(
          err instanceof Error
            ? err.message
            : "Could not save that preference.",
        );
      }
    },
    [row],
  );

  const removeSubscription = useCallback(
    async (id: string) => {
      try {
        await pushApi.removeById(id);
        if (row && row.id === id) {
          // If they removed the current device's sub
          await disable();
        } else {
          void fetchAll();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not remove subscription",
        );
      }
    },
    [row, disable, fetchAll],
  );

  return {
    status,
    row,
    allSubscriptions,
    pending,
    error,
    enable,
    disable,
    updatePreferences,
    removeSubscription,
  };
}
