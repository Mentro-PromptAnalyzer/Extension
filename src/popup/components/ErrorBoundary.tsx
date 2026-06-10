import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '13px',
          }}
        >
          <div style={{ marginBottom: 8, fontSize: 22 }}>⚠️</div>
          <div style={{ marginBottom: 4, color: 'rgba(255,255,255,0.85)' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{this.state.message}</div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              marginTop: 14,
              padding: '5px 14px',
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 6,
              color: 'rgba(167,139,250,0.9)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
