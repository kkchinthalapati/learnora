import { useMutation } from "@tanstack/react-query";
import { authApi } from "../../api/auth";
import { Button } from "../../components/Button";
import { useToast } from "../../context/toast";
import styles from "./auth.module.css";

/* "Continue with Google". Off until the Google provider is switched on in
 * Supabase (WAITINGONLEDGER 4.x): VITE_GOOGLE_SIGNIN=true turns it on for a
 * build, so a build without the provider never shows a button that errors. */
export const GOOGLE_SIGNIN_ENABLED = import.meta.env.VITE_GOOGLE_SIGNIN === "true";

export function GoogleSignInButton({ label }: { label: string }) {
  const { showToast } = useToast();
  const google = useMutation({
    mutationFn: () => authApi.loginWithGoogle(),
    onError: (error) => showToast((error as Error).message, { error: true }),
  });

  if (!GOOGLE_SIGNIN_ENABLED) return null;

  return (
    <div className={styles.googleBlock}>
      <Button
        type="button"
        className={styles.submit}
        disabled={google.isPending}
        onClick={() => google.mutate()}
      >
        {google.isPending ? "Opening Google…" : label}
      </Button>
      <p className={styles.orDivider} aria-hidden="true">
        or with email
      </p>
    </div>
  );
}
