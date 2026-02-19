import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-slate-900 min-h-screen text-red-500 font-mono">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                    <div className="bg-slate-800 p-4 rounded-lg border border-red-500/50 overflow-auto">
                        <p className="text-lg font-bold">{this.state.error && this.state.error.toString()}</p>
                        <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap">
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
