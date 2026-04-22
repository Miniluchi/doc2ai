import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import './App.css';
import Doc2aiLogoUrl from './assets/doc2ai-full.svg';
import { useMonitoring } from './hooks/useMonitoring';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';

function App() {
  const { status: monitoringStatus } = useMonitoring();

  const isAuthCallback =
    window.location.pathname === '/auth/callback' ||
    window.location.search.includes('success=true') ||
    window.location.search.includes('data=');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={Doc2aiLogoUrl} className="h-8 w-8" alt="Doc2AI logo" />
            <h1 className="text-2xl font-bold">Doc2AI</h1>
            <Badge variant="secondary">Self-hosted</Badge>
          </div>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 flex-1">
        {isAuthCallback ? <AuthCallback /> : <Dashboard />}
      </main>

      <footer className="border-t">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>Doc2AI - Automatic documentation converter for developers</p>
            {monitoringStatus?.isRunning && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs">Online</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
