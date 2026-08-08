import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon } from "./Icon";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/* App-wide crash net. Nothing in the tree caught errors before this — a bug
 * anywhere (a Rules-of-Hooks violation, a null dereference, anything) unmounts
 * the whole app to a blank white tab, mid-quiz or otherwise. This doesn't
 * recover lost state by itself (see useQuizDraft for that, on the exam/quiz
 * screens specifically); it exists so a bug degrades to a recoverable screen
 * instead of a blank one.
 *
 * Has to be a class component — componentDidCatch/getDerivedStateFromError
 * have no hook equivalent. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // TODO: wire to real error telemetry once this app has one. Nothing in
    // the codebase reports client errors anywhere yet, so console is the
    // honest baseline rather than inventing a reporting pipeline.
    console.error("Uncaught error in app tree:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className={styles.view}>
          <Card variant="panel" padding="lg" className={styles.panel}>
            <Icon name="alert-triangle" size={32} className={styles.icon} />
            <h1>Something went wrong</h1>
            <p className={styles.muted}>
              This screen hit an unexpected error. Your work up to this point
              may not be saved.
            </p>
            <div className={styles.actions}>
              <Button variant="primary" onClick={this.reset}>
                Try again
              </Button>
              <Link to="/" className={styles.dashboardLink} onClick={this.reset}>
                Go to Dashboard
              </Link>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
