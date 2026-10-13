import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Echo could not render this screen", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <main className="app-error-screen" role="alert" aria-live="assertive">
        <section className="app-error-card">
          <h1>Echo hit a problem</h1>
          <p>Reload the app to continue. If this keeps happening, contact your Echo administrator.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload Echo</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
