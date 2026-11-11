import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/auth";
import { isFounder } from "../lib/founderAuth";
import { Skeleton } from "./Skeleton";

export interface FounderGateProps {
  children?: ReactNode;
  /**
   * Handling when an authenticated non-founder attempts access:
   * - "redirect" (default): navigate immediately to "/"
   * - "card": render an accessible 403 unauthorized notification card
   */
  blockMode?: "redirect" | "card";
  /** Optional custom fallback to render when access is denied */
  fallback?: ReactNode;
}

export function FounderGate({
  children,
  blockMode = "redirect",
  fallback,
}: FounderGateProps) {
  const { user, session, loading } = useAuth();
  const location = useLocation();

  // 1. Initializing auth state — render dark workspace skeleton without bouncing
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading Founder Workspace"
        aria-busy="true"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100vw",
          backgroundColor: "#1a1d21",
          gap: "16px",
        }}
      >
        <Skeleton width={240} height={32} />
        <Skeleton width={160} height={16} />
      </div>
    );
  }

  // 2. Unauthenticated user — always to sign-in, dev builds included. There
  //    used to be a dev-only bypass here; it let anyone signed out into the
  //    founder tools on a dev server, and it is what the gate's own tests
  //    caught. Founders sign in like everyone else.
  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 3. Authenticated student / non-founder user — block access
  if (!isFounder(user)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (blockMode === "card") {
      return (
        <main
          role="alert"
          aria-label="Access Restricted"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            backgroundColor: "#1a1d21",
            color: "#d1d2d3",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "460px",
              padding: "36px 32px",
              backgroundColor: "#222529",
              borderRadius: "8px",
              border: "1px solid #36393e",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔒</div>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#ffffff",
                marginBottom: "8px",
              }}
            >
              Founder Workspace Access Restricted
            </h1>
            <p
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#ababad",
                marginBottom: "24px",
              }}
            >
              This workspace is reserved exclusively for Learnora founders. Your
              account does not have authorization to view this area.
            </p>
            <Link
              to="/"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                backgroundColor: "#007a5a",
                color: "#ffffff",
                borderRadius: "4px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              Return to Student Dashboard
            </Link>
          </div>
        </main>
      );
    }

    // Default redirect to home dashboard with state
    return (
      <Navigate
        to="/"
        replace
        state={{ denied: true, reason: "founders_only", from: location }}
      />
    );
  }

  // 4. Authorized founder — render children or layout outlet
  return children ? <>{children}</> : <Outlet />;
}
