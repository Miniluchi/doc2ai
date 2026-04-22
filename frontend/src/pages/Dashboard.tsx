import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, AlertCircle, Cloud, Download, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SourceCard } from '../components/dashboard/SourceCard';
import { AddSourceDialog } from '../components/forms/AddSourceDialog';
import { useConversionStats } from '../hooks/useConversions';
import { useMonitoring } from '../hooks/useMonitoring';
import { useSources, useSourceStats } from '../hooks/useSources';

export default function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    sources,
    loading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useSources();
  const { stats: sourceStats, loading: statsLoading } = useSourceStats();
  const { status: monitoringStatus } = useMonitoring();
  const { stats: conversionStats } = useConversionStats();

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
    <>
      {sourcesError && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Error loading data: {sourcesError}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              Connected sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16 mb-2 mx-auto" />
            ) : (
              <div className="text-3xl font-bold">
                {sourceStats?.totalSources || sources.length}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Configured document sources</p>
            {sourceStats && sourceStats.activeSources > 0 && (
              <Badge variant="outline" className="mt-2">
                {sourceStats.activeSources} active
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <Download className="h-5 w-5 text-green-500" />
              Converted files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{conversionStats?.recent ?? 0}</div>
            <p className="text-sm text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              System status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monitoringStatus ? (
              <>
                <Badge variant={monitoringStatus.isRunning ? 'default' : 'secondary'}>
                  {monitoringStatus.isRunning ? 'Active' : 'Inactive'}
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  {monitoringStatus.isRunning
                    ? `${monitoringStatus.totalActiveSources} sources monitored`
                    : 'Monitoring stopped'}
                </p>
              </>
            ) : (
              <>
                <Skeleton className="h-6 w-16 mb-2 mx-auto" />
                <Skeleton className="h-4 w-24 mx-auto" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Document Sources Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Document sources</h2>
            <p className="text-muted-foreground">
              Configure your cloud drives and document repositories
            </p>
          </div>
          <AddSourceDialog onSourceAdded={handleSourceAdded}>
            <Button>
              <Plus className="h-4 w-4" />
              Add source
            </Button>
          </AddSourceDialog>
        </div>

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

        {!sourcesLoading && sources.length === 0 && (
          <Card className="p-12 text-center">
            <CardContent>
              <Cloud className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2">No document sources</CardTitle>
              <CardDescription className="mb-6 max-w-md mx-auto">
                Start by connecting your first document source. Support for Microsoft SharePoint,
                Google Drive, and other cloud storage platforms.
              </CardDescription>
              <AddSourceDialog onSourceAdded={handleSourceAdded}>
                <Button size="lg">
                  <Plus className="h-4 w-4" />
                  Add your first source
                </Button>
              </AddSourceDialog>
            </CardContent>
          </Card>
        )}

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
    </>
  );
}
