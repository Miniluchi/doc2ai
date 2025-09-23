import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface GoogleDriveFolder {
  id: string;
  name: string;
  path: string;
  modifiedTime: string;
  parents?: string[];
  type: "folder";
}

interface GoogleDriveFolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onFolderSelect: (folder: GoogleDriveFolder) => void;
  credentials: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export function GoogleDriveFolderPicker({
  isOpen,
  onClose,
  onFolderSelect,
  credentials,
}: GoogleDriveFolderPickerProps) {
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: "root", name: "Mon Drive" },
  ]);

  const fetchFolders = async (folderId: string) => {
    if (!credentials?.refreshToken) {
      toast.error("Credentials Google Drive manquants");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/sources/google-drive/folders?parent_id=${folderId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credentials,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setFolders(result.data);
      } else {
        throw new Error(
          result.message || "Erreur lors du chargement des dossiers",
        );
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      toast.error("Erreur lors du chargement des dossiers Google Drive");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  // Charger les dossiers quand le dialog s'ouvre ou quand le dossier courant change
  useEffect(() => {
    if (isOpen && credentials?.refreshToken) {
      fetchFolders(currentFolderId);
    }
  }, [isOpen, currentFolderId, credentials?.refreshToken]);

  const handleFolderClick = (folder: GoogleDriveFolder) => {
    // Naviguer dans le dossier
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (breadcrumbIndex: number) => {
    const targetBreadcrumb = breadcrumbs[breadcrumbIndex];
    setCurrentFolderId(targetBreadcrumb.id);
    setBreadcrumbs((prev) => prev.slice(0, breadcrumbIndex + 1));
  };

  const handleSelectCurrentFolder = () => {
    const currentFolder = breadcrumbs[breadcrumbs.length - 1];
    onFolderSelect({
      id: currentFolder.id,
      name: currentFolder.name,
      path: `/${breadcrumbs
        .slice(1)
        .map((b) => b.name)
        .join("/")}`,
      modifiedTime: new Date().toISOString(),
      type: "folder",
    });
    onClose();
  };

  const handleSelectFolder = (folder: GoogleDriveFolder) => {
    onFolderSelect(folder);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Choisir un dossier Google Drive
          </DialogTitle>
          <DialogDescription>
            Sélectionnez le dossier que vous souhaitez surveiller pour la
            conversion automatique
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Breadcrumbs */}
          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
            {breadcrumbs.map((breadcrumb, index) => (
              <React.Fragment key={breadcrumb.id}>
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className="hover:text-foreground hover:underline"
                >
                  {breadcrumb.name}
                </button>
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="h-4 w-4" />
                )}
              </React.Fragment>
            ))}
          </div>

          <Separator />

          {/* Bouton pour sélectionner le dossier courant */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Dossier actuel:{" "}
              <span className="font-medium">
                {breadcrumbs[breadcrumbs.length - 1].name}
              </span>
            </div>
            <Button
              onClick={handleSelectCurrentFolder}
              variant="outline"
              size="sm"
            >
              Sélectionner ce dossier
            </Button>
          </div>

          <Separator />

          {/* Liste des dossiers */}
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Chargement des dossiers...</span>
              </div>
            ) : folders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucun sous-dossier trouvé</p>
                <p className="text-sm">
                  Vous pouvez sélectionner le dossier courant ci-dessus
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                  >
                    <div
                      className="flex items-center space-x-3 flex-1"
                      onClick={() => handleFolderClick(folder)}
                    >
                      <Folder className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{folder.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Modifié le{" "}
                          {new Date(folder.modifiedTime).toLocaleDateString(
                            "fr-FR",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFolder(folder);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        Sélectionner
                      </Button>
                      <Button
                        onClick={() => handleFolderClick(folder)}
                        variant="ghost"
                        size="sm"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GoogleDriveFolderPicker;
