import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleClearData = () => {
    if (confirm('This will clear all saved game data. Are you sure?')) {
      localStorage.removeItem('cricket-manager-save');
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-gray-800 rounded-xl p-6 border border-red-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
            </div>

            <p className="text-gray-300 mb-4">
              The game encountered an error. This might be due to corrupted save data
              or a bug in the game.
            </p>

            {this.state.error && (
              <details className="mb-4">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-gray-900 rounded text-xs text-red-300 overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleReset}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleClearData}
                className="w-full py-2 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg font-medium transition-colors"
              >
                Clear Save Data & Restart
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              If this keeps happening, please report it at{' '}
              <a
                href="https://github.com/anthropics/claude-code/issues"
                className="text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Issues
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
