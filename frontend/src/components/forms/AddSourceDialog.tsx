import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, FileText, FolderOpen, Loader2, Plus } from "lucide-react";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import GoogleDriveIconUrl from "../../assets/GoogleDrive.svg";
import OneDriveIconUrl from "../../assets/OneDrive.svg";
import SharePointIconUrl from "../../assets/Sharepoint.svg";
import { useGoogleAuth } from "../../hooks/useGoogleAuth";
import { useSources } from "../../hooks/useSources";
import type { CreateSourceRequest } from "../../types/api";
import { GoogleAuthButton } from "../auth/GoogleAuthButton";
import FilePreview from "./FilePreview";
import GoogleDriveFolderPicker from "./GoogleDriveFolderPicker";

// Composants SVG wrappés
const GoogleDriveIcon = ({ className }: { className?: string }) => (
  <img src={GoogleDriveIconUrl} className={className} alt="Google Drive" />
);

const OneDriveIcon = ({ className }: { className?: string }) => (
  <img src={OneDriveIconUrl} className={className} alt="OneDrive" />
);

const SharePointIcon = ({ className }: { className?: string }) => (
  <img src={SharePointIconUrl} className={className} alt="SharePoint" />
);

// Schéma de validation simplifié
const sourceFormSchema = z.object({
  name: z
    .string()
    .min(1, "Donnez un nom à votre source")
    .max(100, "Le nom est trop long"),
  platform: z.enum(["sharepoint", "googledrive", "onedrive"], {
    message: "Choisissez votre plateforme",
  }),
  sourcePath: z.string().min(1, "Indiquez le dossier à surveiller"),
  siteUrl: z.string().url("URL invalide").optional().or(z.literal("")),
  destinations: z.string().min(1, "Où voulez-vous sauvegarder vos fichiers ?"),
  extensions: z.string().optional(),
  excludePatterns: z.string().optional(),
});

type SourceFormData = z.infer<typeof sourceFormSchema>;

interface AddSourceDialogProps {
  children: React.ReactNode;
  onSourceAdded?: () => void;
}

export function AddSourceDialog({
  children,
  onSourceAdded,
}: AddSourceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{
    id: string;
    name: string;
    path: string;
  } | null>(null);

  const { createSource } = useSources();
  const { user: googleUser, error: authError } = useGoogleAuth();

  const form = useForm<SourceFormData>({
    resolver: zodResolver(sourceFormSchema),
    defaultValues: {
      name: "",
      platform: undefined,
      sourcePath: "/",
      siteUrl: "",
      destinations: "",
      extensions: ".docx,.pdf,.doc,.txt",
      excludePatterns: "temp,~$,draft",
    },
  });

  const selectedPlatform = form.watch("platform");

  // Réinitialiser la sélection de dossier quand on change de plateforme
  React.useEffect(() => {
    if (selectedPlatform !== "googledrive") {
      setSelectedFolder(null);
    }
  }, [selectedPlatform]);

  const handleFolderSelect = (folder: {
    id: string;
    name: string;
    path: string;
  }) => {
    setSelectedFolder(folder);
    form.setValue("sourcePath", folder.id); // Pour Google Drive, on utilise l'ID
    setShowFolderPicker(false);
  };

  const openFolderPicker = () => {
    if (!googleUser?.refreshToken) {
      alert("Veuillez vous connecter avec Google d'abord");
      return;
    }
    setShowFolderPicker(true);
  };

  const onSubmit = async (data: SourceFormData) => {
    try {
      setIsSubmitting(true);

      // Validation spécifique pour Google Drive
      if (data.platform === "googledrive" && !googleUser?.refreshToken) {
        alert("Veuillez vous connecter avec Google d'abord");
        return;
      }

      // Préparer les credentials selon la plateforme
      let credentials: any = {};
      if (data.platform === "googledrive") {
        credentials = {
          clientId: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_ID,
          clientSecret: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_SECRET,
          refreshToken: googleUser?.refreshToken,
        };
      } else {
        // Microsoft credentials par défaut
        credentials = {
          clientId: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_ID,
          clientSecret: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_SECRET,
          tenantId: import.meta.env.VITE_DEFAULT_MICROSOFT_TENANT_ID,
        };
      }

      // Préparer les destinations
      const destinations = data.destinations
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d.length > 0);

      // Préparer les filtres
      const extensions = data.extensions
        ?.split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0) || [".docx", ".pdf", ".doc"];

      const excludePatterns =
        data.excludePatterns
          ?.split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0) || [];

      const sourceData: CreateSourceRequest = {
        name: data.name,
        platform: data.platform,
        config: {
          credentials,
          sourcePath: data.sourcePath,
          ...(data.platform === "sharepoint" &&
            data.siteUrl && { siteUrl: data.siteUrl }),
          destinations,
          filters: {
            extensions,
            excludePatterns,
          },
        },
      };

      await createSource(sourceData);

      // Fermer le dialog et reset
      setOpen(false);
      form.reset();
      setSelectedFolder(null);
      onSourceAdded?.();
    } catch (error) {
      console.error("Error creating source:", error);
      form.setError("platform", {
        message:
          error instanceof Error ? error.message : "Erreur lors de la création",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "googledrive":
        return <GoogleDriveIcon className="w-5 h-5" />;
      case "sharepoint":
        return <SharePointIcon className="w-5 h-5" />;
      case "onedrive":
        return <OneDriveIcon className="w-5 h-5" />;
      default:
        return "📁";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Ajouter une source documentaire
          </DialogTitle>
          <DialogDescription>
            Connectez votre plateforme de stockage pour convertir
            automatiquement vos documents en Markdown
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 1. Informations de base */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">
                  1
                </div>
                <h3 className="text-lg font-medium">Informations de base</h3>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom de votre source</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ex: Documents équipe, Guides utilisateur..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Un nom pour reconnaître facilement cette source
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plateforme de stockage</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Où sont stockés vos documents ?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="googledrive">
                          <span className="flex items-center gap-2">
                            <GoogleDriveIcon className="w-4 h-4" /> Google Drive
                          </span>
                        </SelectItem>
                        <SelectItem value="sharepoint">
                          <span className="flex items-center gap-2">
                            <SharePointIcon className="w-4 h-4" />
                            Microsoft SharePoint
                          </span>
                        </SelectItem>
                        <SelectItem value="onedrive">
                          <span className="flex items-center gap-2">
                            <OneDriveIcon className="w-4 h-4" />
                            Microsoft OneDrive
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 2. Connexion à la plateforme */}
            {selectedPlatform && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-sm font-semibold">
                    2
                  </div>
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    Connexion à {getPlatformIcon(selectedPlatform)}
                    {selectedPlatform === "googledrive"
                      ? "Google Drive"
                      : selectedPlatform === "sharepoint"
                        ? "SharePoint"
                        : "OneDrive"}
                  </h3>
                </div>

                {selectedPlatform === "googledrive" ? (
                  <GoogleAuthButton />
                ) : (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-800">
                        Credentials Microsoft configurés
                      </span>
                    </div>
                    <p className="text-sm text-blue-700">
                      L'authentification Microsoft est déjà configurée dans
                      l'application
                    </p>
                  </div>
                )}

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {authError}
                  </div>
                )}
              </div>
            )}

            {/* 3. Configuration des dossiers */}
            {selectedPlatform &&
              (googleUser?.email || selectedPlatform !== "googledrive") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 bg-orange-100 text-orange-600 rounded-full text-sm font-semibold">
                      3
                    </div>
                    <h3 className="text-lg font-medium">
                      Configuration des dossiers
                    </h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="sourcePath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          Dossier à surveiller
                        </FormLabel>
                        <FormControl>
                          {selectedPlatform === "googledrive" ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Input
                                  placeholder={
                                    selectedFolder
                                      ? selectedFolder.name
                                      : "Cliquez pour choisir un dossier"
                                  }
                                  value={
                                    selectedFolder ? selectedFolder.name : ""
                                  }
                                  readOnly
                                  onClick={openFolderPicker}
                                  className="cursor-pointer"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={openFolderPicker}
                                  disabled={!googleUser?.refreshToken}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                </Button>
                              </div>
                              {selectedFolder && (
                                <p className="text-sm text-muted-foreground">
                                  Chemin: {selectedFolder.path || "/"}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Input
                              placeholder="/ (pour tout le drive)"
                              {...field}
                            />
                          )}
                        </FormControl>
                        <FormDescription>
                          {selectedPlatform === "googledrive"
                            ? "Choisissez le dossier à surveiller dans votre Google Drive"
                            : 'Le dossier dont vous voulez convertir les documents. "/" pour surveiller tout le drive.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedPlatform === "sharepoint" && (
                    <FormField
                      control={form.control}
                      name="siteUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL de votre site SharePoint</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://monentreprise.sharepoint.com/sites/documents"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            L'adresse complète de votre site SharePoint
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="destinations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Où sauvegarder les fichiers convertis
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="/Users/john/Documents/markdown, /workspace/docs"
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Dossiers locaux où copier les fichiers convertis
                          (séparés par des virgules)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Prévisualisation des fichiers pour Google Drive */}
                  {selectedPlatform === "googledrive" &&
                    selectedFolder &&
                    googleUser?.refreshToken && (
                      <FilePreview
                        folderId={selectedFolder.id}
                        folderName={selectedFolder.name}
                        credentials={{
                          clientId: import.meta.env
                            .VITE_DEFAULT_GOOGLE_CLIENT_ID,
                          clientSecret: import.meta.env
                            .VITE_DEFAULT_GOOGLE_CLIENT_SECRET,
                          refreshToken: googleUser.refreshToken,
                        }}
                        extensions={
                          form
                            .watch("extensions")
                            ?.split(",")
                            .map((e) => e.trim())
                            .filter((e) => e.length > 0) || [
                            ".docx",
                            ".pdf",
                            ".doc",
                            ".txt",
                          ]
                        }
                      />
                    )}
                </div>
              )}

            {/* 4. Filtres (optionnel, collapsible) */}
            {selectedPlatform &&
              (googleUser?.email || selectedPlatform !== "googledrive") && (
                <details className="space-y-4">
                  <summary className="flex items-center gap-2 cursor-pointer">
                    <div className="flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold">
                      4
                    </div>
                    <h3 className="text-lg font-medium">
                      Filtres avancés (optionnel)
                    </h3>
                  </summary>

                  <div className="ml-8 space-y-4">
                    <FormField
                      control={form.control}
                      name="extensions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Types de fichiers à traiter</FormLabel>
                          <FormControl>
                            <Input
                              placeholder=".docx,.pdf,.doc,.txt"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Extensions de fichiers (séparées par des virgules)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="excludePatterns"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fichiers à ignorer</FormLabel>
                          <FormControl>
                            <Input placeholder="temp,draft,~$" {...field} />
                          </FormControl>
                          <FormDescription>
                            Mots dans le nom des fichiers à exclure (séparés par
                            des virgules)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </details>
              )}

            {/* Boutons d'action */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  (selectedPlatform === "googledrive" && !googleUser?.email)
                }
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Créer la source
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>

        {/* Google Drive Folder Picker */}
        {selectedPlatform === "googledrive" && googleUser?.refreshToken && (
          <GoogleDriveFolderPicker
            isOpen={showFolderPicker}
            onClose={() => setShowFolderPicker(false)}
            onFolderSelect={handleFolderSelect}
            credentials={{
              clientId: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_ID,
              clientSecret: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_SECRET,
              refreshToken: googleUser.refreshToken,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
