import { Component } from "react";
import { AlertTriangle } from "lucide-react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="opacity-60 max-w-md">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

