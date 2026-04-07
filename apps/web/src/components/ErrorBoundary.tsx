import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg)',
            color: 'var(--text)',
            flexDirection: 'column',
            gap: '16px',
            padding: '20px',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>
              Oops! Something went wrong
            </h1>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <details style={{ marginBottom: '16px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Error details
              </summary>
              <pre
                style={{
                  background: 'var(--bg-2)',
                  padding: '12px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  margin: '8px 0 0 0',
                }}
              >
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '4px',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
