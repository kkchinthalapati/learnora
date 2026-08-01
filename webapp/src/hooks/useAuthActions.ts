import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api/auth";

/* One-shot auth mutations (login, signup, password/email/profile changes,
 * account deletion) — distinct from `useAuth()` in `context/auth.ts`, which
 * is the reactive session read, not an action. */

export function useLogin() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: ({
      name,
      email,
      password,
      dob,
    }: {
      name: string;
      email: string;
      password: string;
      dob: string;
    }) => authApi.signup(name, email, password, dob),
  });
}

export function useResetPasswordRequest() {
  return useMutation({
    mutationFn: (email: string) => authApi.resetPasswordRequest(email),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (newPassword: string) => authApi.updatePassword(newPassword),
  });
}

export function useUpdateEmail() {
  return useMutation({
    mutationFn: (newEmail: string) => authApi.updateEmail(newEmail),
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => authApi.updateProfile(data),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (newPassword: string) => authApi.changePassword(newPassword),
  });
}

export function useSignOutOthers() {
  return useMutation({ mutationFn: authApi.signOutOthers });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: authApi.deleteAccount });
}
