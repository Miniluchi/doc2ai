import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, Folder, FolderOpen, Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { sourcesApi } from '../../services/api';

interface GoogleDriveFolder {
  id: string;
  name: string;
  path: string;
  modifiedTime: string;
  parents?: string[];
  type: 'folder';
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
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'My Drive' },
  ]);

  const fetchFolders = useCallback(
    async (folderId: string) => {
      if (!credentials?.refreshToken) {
        toast.error('Google Drive credentials missing');
        return;
      }

      setLoading(true);
      try {
        const folders = await sourcesApi.getGoogleDriveFolders(folderId, credentials);
        setFolders(folders);
      } catch (error) {
        console.error('Error fetching folders:', error);
        toast.error('Error loading Google Drive folders');
        setFolders([]);
      } finally {
        setLoading(false);
      }
    },
    [credentials],
  );

  useEffect(() => {
    if (isOpen && credentials?.refreshToken) {
      fetchFolders(currentFolderId);
    }
  }, [isOpen, currentFolderId, credentials?.refreshToken, fetchFolders]);

  const handleFolderClick = (folder: GoogleDriveFolder) => {
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
        .join('/')}`,
      modifiedTime: new Date().toISOString(),
      type: 'folder',
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
            Choose a Google Drive folder
          </DialogTitle>
          <DialogDescription>
            Select the folder you want to monitor for automatic conversion
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
                {index < breadcrumbs.length - 1 && <ChevronRight className="h-4 w-4" />}
              </React.Fragment>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Current folder:{' '}
              <span className="font-medium">{breadcrumbs[breadcrumbs.length - 1].name}</span>
            </div>
            <Button onClick={handleSelectCurrentFolder} variant="outline" size="sm">
              Select this folder
            </Button>
          </div>

          <Separator />

          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading folders...</span>
              </div>
            ) : folders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No subfolders found</p>
                <p className="text-sm">You can select the current folder above</p>
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
                          Modified {new Date(folder.modifiedTime).toLocaleDateString('en-US')}
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
                        Select
                      </Button>
                      <Button onClick={() => handleFolderClick(folder)} variant="ghost" size="sm">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GoogleDriveFolderPicker;
