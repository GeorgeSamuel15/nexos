import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@nexos/ui';

interface ErrorBoundaryProperties extends PropsWithChildren {
  name: string;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProperties, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, information: ErrorInfo): void {
    console.error(
      `NexOS isolated a crash in ${this.props.name}`,
      error,
      information.componentStack,
    );
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="app-crash">
        <AlertTriangle size={34} />
        <h2>{this.props.name} stopped responding</h2>
        <p>{this.state.error.message}</p>
        <Button onClick={() => this.setState({ error: null })}>
          <RotateCcw size={16} /> Restart view
        </Button>
      </div>
    );
  }
}
