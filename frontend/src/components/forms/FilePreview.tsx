import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface FilePreviewItem {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
  mimeType: string;
}

interface FilePreviewData {
  totalFiles: number;
  convertibleFiles: number;
  files: FilePreviewItem[];
}

interface FilePreviewProps {
  folderId: string;
  folderName: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  extensions: string[];
}

export function FilePreview({
  folderId,
  folderName,
  credentials,
  extensions,
}: FilePreviewProps) {
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchFilePreview = useCallback(async () => {
    if (!credentials?.refreshToken || !folderId) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/sources/google-drive/preview-files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folder_id: folderId,
          credentials,
          extensions,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setPreviewData(result.data);
      } else {
        throw new Error(
          result.message || "Erreur lors du chargement des fichiers",
        );
      }
    } catch (error) {
      console.error("Error fetching file preview:", error);
      toast.error("Erreur lors du chargement de la prévisualisation");
      setPreviewData(null);
    } finally {
      setLoading(false);
    }
  }, [folderId, credentials, extensions]);

  useEffect(() => {
    if (folderId && credentials?.refreshToken) {
      fetchFilePreview();
    }
  }, [folderId, credentials?.refreshToken, extensions, fetchFilePreview]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return "📄";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("word")) return "📝";
    if (mimeType.includes("document")) return "📝";
    if (mimeType.includes("text")) return "📄";
    return "📄";
  };

  if (!folderId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Aperçu des fichiers à convertir
        </CardTitle>
        <CardDescription>
          Fichiers qui seront automatiquement convertis depuis le dossier "
          {folderName}"
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Analyse des fichiers en cours...</span>
          </div>
        ) : previewData ? (
          <div className="space-y-4">
            {/* Statistiques */}
            <div className="flex gap-4">
              <Badge variant="outline">
                {previewData.totalFiles} fichier
                {previewData.totalFiles > 1 ? "s" : ""} total
              </Badge>
              <Badge
                variant={
                  previewData.convertibleFiles > 0 ? "default" : "secondary"
                }
              >
                {previewData.convertibleFiles} fichier
                {previewData.convertibleFiles > 1 ? "s" : ""} convertible
                {previewData.convertibleFiles > 1 ? "s" : ""}
              </Badge>
            </div>

            {/* Liste des fichiers convertibles */}
            {previewData.convertibleFiles > 0 ? (
              <ScrollArea className="h-[200px] w-full rounded-md border">
                <div className="p-4 space-y-2">
                  {previewData.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-lg border bg-background"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">
                          {getFileIcon(file.mimeType)}
                        </span>
                        <div>
                          <p className="font-medium text-sm">
                            {file.name || "Fichier sans nom"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file.size
                              ? formatFileSize(file.size)
                              : "Taille inconnue"}{" "}
                            • Modifié le{" "}
                            {file.modifiedTime
                              ? new Date(file.modifiedTime).toLocaleDateString(
                                  "fr-FR",
                                )
                              : "Date inconnue"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {file.mimeType?.includes("pdf")
                          ? "PDF"
                          : file.mimeType?.includes("word")
                            ? "Word"
                            : file.mimeType?.includes("document")
                              ? "Google Docs"
                              : "Document"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucun fichier convertible trouvé</p>
                <p className="text-sm">
                  Formats supportés: {extensions.join(", ")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <p>Sélectionnez un dossier pour voir l'aperçu des fichiers</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FilePreview;
