'use client';
import { Component } from 'react';

interface Props {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Something went wrong loading this section.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-sm text-primary underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
