import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar,
  CheckCircle,
  Cloud,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Settings,
  TestTube,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useSources } from "../../hooks/useSources";
import type { Source } from "../../types/api";

interface SourceCardProps {
  source: Source;
  onSync?: (sourceId: string) => void;
  onDelete?: (sourceId: string) => void;
}

export function SourceCard({ source, onSync, onDelete }: SourceCardProps) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { testConnection, syncSource, deleteSource } = useSources();

  const handleTestConnection = async () => {
    try {
      setIsTestingConnection(true);
      setConnectionResult(null);
      const result = await testConnection(source.id);
      setConnectionResult(result);
    } catch (error) {
      setConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : "Erreur de test",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await syncSource(source.id);
      onSync?.(source.id);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSource(source.id);
      setShowDeleteDialog(false);
      onDelete?.(source.id);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Actif</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactif</Badge>;
      case "error":
        return <Badge variant="destructive">Erreur</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlatformIcon = (_platform: string) => {
    return <Cloud className="h-5 w-5 text-blue-500" />;
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case "sharepoint":
        return "Microsoft SharePoint";
      case "onedrive":
        return "Microsoft OneDrive";
      case "googledrive":
        return "Google Drive";
      default:
        return platform;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Jamais";
    try {
      const date = new Date(dateString);
      return format(date, "PPp", { locale: fr });
    } catch {
      return "Date invalide";
    }
  };

  return (
    <>
      <Card className="transition-all hover:shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getPlatformIcon(source.platform)}
              <div>
                <CardTitle className="text-lg">{source.name}</CardTitle>
                <CardDescription>
                  {getPlatformLabel(source.platform)}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(source.status)}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                  >
                    {isTestingConnection ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    Tester la connexion
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Synchroniser maintenant
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    Configurer
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Résultat du test de connexion */}
          {connectionResult && (
            <div
              className={`p-3 rounded-lg border text-sm ${
                connectionResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {connectionResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {connectionResult.success
                    ? "Connexion OK"
                    : "Connexion échouée"}
                </span>
              </div>
              <p className="mt-1">{connectionResult.message}</p>
            </div>
          )}

          {/* Informations de la source */}
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                <span>Chemin source:</span>
              </div>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                {source.config.sourcePath}
              </code>
            </div>

            {source.config.destination && (
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4" />
                  <span>Destination:</span>
                </div>
                <code className="bg-muted px-2 py-1 rounded text-xs">
                  {source.config.destination}
                </code>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Dernière sync réussie:</span>
              </div>
              <span className="text-xs">{formatDate(source.lastSync)}</span>
            </div>
          </div>

          {/* Extensions et filtres */}
          {source.config.filters && (
            <div className="space-y-2">
              {source.config.filters.extensions &&
                source.config.filters.extensions.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Extensions:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {source.config.filters.extensions.map((ext, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs"
                        >
                          {ext}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Jobs récents */}
          {source.jobs && source.jobs.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">
                Jobs récents:
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {source.jobs.length} job{source.jobs.length > 1 ? "s" : ""}
                </Badge>
                {source.jobs.some((job) => job.status === "failed") && (
                  <Badge variant="destructive" className="text-xs">
                    Erreurs
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la source ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les données associées à la
              source "{source.name}" seront supprimées, y compris l'historique
              des conversions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
