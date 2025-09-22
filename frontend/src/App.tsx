import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertCircle,
  Cloud,
  Download,
  FileText,
  Plus,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import "./App.css";
import { SourceCard } from "./components/dashboard/SourceCard";
import { AddSourceDialog } from "./components/forms/AddSourceDialog";
import { useConversionStats } from "./hooks/useConversions";
import { useMonitoring } from "./hooks/useMonitoring";
import { useSources, useSourceStats } from "./hooks/useSources";
import AuthCallback from "./pages/AuthCallback";

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Détecter si on est sur la page de callback OAuth
  const isAuthCallback =
    window.location.pathname === "/auth/callback" ||
    window.location.search.includes("success=true") ||
    window.location.search.includes("data=");

  // Si on est sur la page de callback, afficher seulement le composant AuthCallback
  if (isAuthCallback) {
    return <AuthCallback />;
  }

  // Hooks pour les données
  const {
    sources,
    loading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useSources();
  const { stats: sourceStats, loading: statsLoading } = useSourceStats();
  const { status: monitoringStatus } = useMonitoring();
  const { stats: conversionStats } = useConversionStats();

  // Rafraîchir les données quand refreshKey change
  useEffect(() => {
    if (refreshKey > 0) {
      refetchSources();
    }
  }, [refreshKey, refetchSources]);

  const handleSourceAdded = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleSync = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleDelete = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Doc2AI</h1>
            <Badge variant="secondary">Self-hosted</Badge>
          </div>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Erreur globale */}
        {sourcesError && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erreur lors du chargement: {sourcesError}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500" />
                Sources Connectées
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mb-2" />
              ) : (
                <div className="text-3xl font-bold">
                  {sourceStats?.totalSources || sources.length}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Sources documentaires configurées
              </p>
              {sourceStats && sourceStats.activeSources > 0 && (
                <Badge variant="outline" className="mt-2">
                  {sourceStats.activeSources} actives
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-green-500" />
                Fichiers Convertis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {conversionStats?.byStatus
                  ? Object.values(conversionStats.byStatus).reduce(
                      (a, b) => a + b,
                      0,
                    )
                  : 0}
              </div>
              <p className="text-sm text-muted-foreground">
                Documents traités en Markdown
              </p>
              {conversionStats?.recent && (
                <p className="text-xs text-muted-foreground mt-1">
                  {conversionStats.recent} dernières 24h
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-orange-500" />
                Statut Système
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monitoringStatus ? (
                <>
                  <Badge
                    variant={
                      monitoringStatus.isRunning ? "default" : "secondary"
                    }
                  >
                    {monitoringStatus.isRunning ? "Actif" : "Inactif"}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    {monitoringStatus.isRunning
                      ? `${monitoringStatus.activeMonitors} sources surveillées`
                      : "Monitoring arrêté"}
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="h-6 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Document Sources Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Sources Documentaires</h2>
              <p className="text-muted-foreground">
                Configurez vos drives cloud et dépôts de documents
              </p>
            </div>
            <AddSourceDialog onSourceAdded={handleSourceAdded}>
              <Button>
                <Plus className="h-4 w-4" />
                Ajouter une Source
              </Button>
            </AddSourceDialog>
          </div>

          {/* Loading state */}
          {sourcesLoading && (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!sourcesLoading && sources.length === 0 && (
            <Card className="p-12 text-center">
              <CardContent>
                <Cloud className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <CardTitle className="mb-2">
                  Aucune Source Documentaire
                </CardTitle>
                <CardDescription className="mb-6 max-w-md mx-auto">
                  Commencez par connecter votre première source documentaire.
                  Support pour Microsoft SharePoint, Google Drive et autres
                  plateformes de stockage cloud.
                </CardDescription>
                <AddSourceDialog onSourceAdded={handleSourceAdded}>
                  <Button size="lg">
                    <Plus className="h-4 w-4" />
                    Ajouter Votre Première Source
                  </Button>
                </AddSourceDialog>
              </CardContent>
            </Card>
          )}

          {/* Sources List */}
          {!sourcesLoading && sources.length > 0 && (
            <div className="grid gap-4">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onSync={handleSync}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Doc2AI - Convertisseur Automatique de Documentation pour
              Développeurs
            </p>
            <div className="flex items-center gap-2">
              <p>Auto-hébergé • Sécurisé • Prêt IA</p>
              {monitoringStatus?.isRunning && (
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs">En ligne</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
