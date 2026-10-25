import { useMutation } from "@tanstack/react-query";
import { authApi, type OAuthProvider } from "../../api/auth";
import { Button } from "../../components/Button";
import { useToast } from "../../context/toast";
import styles from "./auth.module.css";

/* "Continue with Google" / "Continue with Apple". Each is off until its
 * provider is switched on in Supabase (WAITINGONLEDGER 4.0): VITE_GOOGLE_SIGNIN
 * and VITE_APPLE_SIGNIN set to "true" turn them on for a build, so a build
 * without the provider never shows a button that errors. */
export const GOOGLE_SIGNIN_ENABLED = import.meta.env.VITE_GOOGLE_SIGNIN === "true";
export const APPLE_SIGNIN_ENABLED = import.meta.env.VITE_APPLE_SIGNIN === "true";

const PROVIDERS: { id: OAuthProvider; name: string; enabled: boolean }[] = [
  { id: "google", name: "Google", enabled: GOOGLE_SIGNIN_ENABLED },
  { id: "apple", name: "Apple", enabled: APPLE_SIGNIN_ENABLED },
];

export function OAuthSignInButtons({ verb }: { verb: "Continue" | "Sign up" }) {
  const { showToast } = useToast();
  const signIn = useMutation({
    mutationFn: (provider: OAuthProvider) => authApi.loginWithOAuth(provider),
    onError: (error) => showToast((error as Error).message, { error: true }),
  });

  const providers = PROVIDERS.filter((p) => p.enabled);
  if (providers.length === 0) return null;

  return (
    <div className={styles.oauthBlock}>
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          className={styles.submit}
          disabled={signIn.isPending}
          onClick={() => signIn.mutate(p.id)}
        >
          {signIn.isPending && signIn.variables === p.id
            ? `Opening ${p.name}…`
            : `${verb} with ${p.name}`}
        </Button>
      ))}
      <p className={styles.orDivider} aria-hidden="true">
        or with email
      </p>
    </div>
  );
}
