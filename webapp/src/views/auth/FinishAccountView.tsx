import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { authApi, dobProblem } from "../../api/auth";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { AI_PROVIDERS_SHORT } from "../../lib/aiProviders";
import { needsAccountDetails } from "../../lib/accountDetails";
import { AuthShell } from "./AuthShell";
import styles from "./auth.module.css";

/* One step for a Google or Apple sign-up: a date of birth (13+, the same rule as the
 * email form) and the AI-consent answer, which must be given explicitly.
 * Nothing else in the app is reachable until both are saved; see the gate in
 * routes.tsx. */
export function FinishAccountView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const dobId = useId();
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: (consent: boolean) => {
      const problem = dobProblem(dob);
      if (problem) throw new Error(problem);
      return authApi.completeAccount(dob, consent);
    },
    /* updateUser fires Supabase's USER_UPDATED, so the auth context picks up
       the new metadata without a refresh here. */
    onSuccess: () => {
      void queryClient.invalidateQueries();
      showToast("Account ready.");
      navigate("/", { replace: true });
    },
    onError: (err) => setError((err as Error).message),
  });

  if (!needsAccountDetails(user)) return <Navigate to="/" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <AuthShell
      title="Finish setting up"
      subtitle="We still need your date of birth. Two quick questions, then you're in."
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.inputGroup}>
          <label htmlFor={dobId}>Date of birth</label>
          <input
            id={dobId}
            type="date"
            value={dob}
            onChange={(e) => {
              setDob(e.target.value);
              setError("");
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${dobId}-error` : undefined}
          />
        </div>

        <fieldset className={styles.inputGroup}>
          <legend>Can Learnora send what you're working on to its AI?</legend>
          <p className={styles.toggleText}>
            It goes to {AI_PROVIDERS_SHORT} to answer your questions. You can change
            this later in Settings.
          </p>
          <Button
            type="button"
            variant="primary"
            className={styles.submit}
            disabled={save.isPending}
            onClick={() => save.mutate(true)}
          >
            Yes, let it help me
          </Button>
          <Button
            type="button"
            className={styles.submit}
            disabled={save.isPending}
            onClick={() => save.mutate(false)}
          >
            No, keep AI off
          </Button>
        </fieldset>

        {error ? (
          <p id={`${dobId}-error`} className={styles.status} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
