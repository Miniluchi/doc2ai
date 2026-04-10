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

const GoogleDriveIcon = ({ className }: { className?: string }) => (
  <img src={GoogleDriveIconUrl} className={className} alt="Google Drive" />
);

const OneDriveIcon = ({ className }: { className?: string }) => (
  <img src={OneDriveIconUrl} className={className} alt="OneDrive" />
);

const SharePointIcon = ({ className }: { className?: string }) => (
  <img src={SharePointIconUrl} className={className} alt="SharePoint" />
);

const sourceFormSchema = z.object({
  name: z
    .string()
    .min(1, "Give your source a name")
    .max(100, "Name is too long"),
  platform: z.enum(["sharepoint", "googledrive", "onedrive"], {
    message: "Choose your platform",
  }),
  sourcePath: z.string().min(1, "Specify the folder to monitor"),
  siteUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  destination: z
    .string()
    .min(1, "Where do you want to save your files?")
    .max(200, "Destination path is too long (max 200 characters)")
    .regex(
      /^[a-zA-Z0-9/_-]+$/,
      "Path can only contain letters, numbers, dashes, underscores, and slashes",
    )
    .refine(
      (val) => !val.includes(".."),
      "Path cannot contain '..' (security)",
    )
    .refine(
      (val) => !val.startsWith("/") && !val.startsWith("\\"),
      "Path must be relative (cannot start with / or \\)",
    ),
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
      destination: "",
      extensions: ".docx,.pdf,.doc,.txt",
      excludePatterns: "temp,~$,draft",
    },
  });

  const selectedPlatform = form.watch("platform");

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
    form.setValue("sourcePath", folder.id);
    setShowFolderPicker(false);
  };

  const openFolderPicker = () => {
    if (!googleUser?.refreshToken) {
      alert("Please connect with Google first");
      return;
    }
    setShowFolderPicker(true);
  };

  const onSubmit = async (data: SourceFormData) => {
    try {
      setIsSubmitting(true);

      if (data.platform === "googledrive" && !googleUser?.refreshToken) {
        alert("Please connect with Google first");
        return;
      }

      let credentials: any = {};
      if (data.platform === "googledrive") {
        credentials = {
          clientId: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_ID,
          clientSecret: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_SECRET,
          refreshToken: googleUser?.refreshToken,
        };
      } else {
        credentials = {
          clientId: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_ID,
          clientSecret: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_SECRET,
          tenantId: import.meta.env.VITE_DEFAULT_MICROSOFT_TENANT_ID,
        };
      }

      const destination = data.destination.trim();

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
          destination,
          filters: {
            extensions,
            excludePatterns,
          },
        },
      };

      await createSource(sourceData);

      setOpen(false);
      form.reset();
      setSelectedFolder(null);
      onSourceAdded?.();
    } catch (error) {
      console.error("Error creating source:", error);
      form.setError("platform", {
        message:
          error instanceof Error ? error.message : "Error creating source",
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
            Add a document source
          </DialogTitle>
          <DialogDescription>
            Connect your storage platform to automatically convert your
            documents to Markdown
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 1. Basic information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">
                  1
                </div>
                <h3 className="text-lg font-medium">Basic information</h3>
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem className="">
                      <FormLabel>Storage platform</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Where are your documents stored?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="googledrive">
                            <span className="flex items-center gap-2">
                              <GoogleDriveIcon className="w-4 h-4" /> Google
                              Drive
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

                <div className="hidden md:flex items-center justify-center pt-6">
                  <div className="w-px h-16 bg-border"></div>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Source name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Team Documents, User Guides..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 2. Platform connection */}
            {selectedPlatform && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-sm font-semibold">
                    2
                  </div>
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    Connect to {getPlatformIcon(selectedPlatform)}
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
                        Microsoft credentials configured
                      </span>
                    </div>
                    <p className="text-sm text-blue-700">
                      Microsoft authentication is already configured in
                      the application
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

            {/* 3. Folder configuration */}
            {selectedPlatform &&
              (googleUser?.email || selectedPlatform !== "googledrive") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 bg-orange-100 text-orange-600 rounded-full text-sm font-semibold">
                      3
                    </div>
                    <h3 className="text-lg font-medium">
                      Folder configuration
                    </h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="sourcePath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          Folder to monitor
                        </FormLabel>
                        <FormControl>
                          {selectedPlatform === "googledrive" ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Input
                                  placeholder={
                                    selectedFolder
                                      ? selectedFolder.name
                                      : "Click to choose a folder"
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
                                  Path: {selectedFolder.path || "/"}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Input
                              placeholder="/ (for entire drive)"
                              {...field}
                            />
                          )}
                        </FormControl>
                        <FormDescription>
                          {selectedPlatform === "googledrive"
                            ? "Choose the folder to monitor in your Google Drive"
                            : 'The folder whose documents you want to convert. "/" to monitor the entire drive.'}
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
                          <FormLabel>SharePoint site URL</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://mycompany.sharepoint.com/sites/documents"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            The full URL of your SharePoint site
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Where to save converted files
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center">
                            <div className="px-3 py-2 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground font-mono">
                              {import.meta.env.VITE_EXPORT_PATH || "./exports"}/
                            </div>
                            <Input
                              placeholder="doc2ai-exports"
                              {...field}
                              className="rounded-l-none border-l-0"
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Relative folder within your EXPORT_PATH for converted
                          files. Example: "doc2ai-exports"
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

            {/* 4. Advanced filters (optional) */}
            {selectedPlatform &&
              (googleUser?.email || selectedPlatform !== "googledrive") && (
                <details className="space-y-4">
                  <summary className="flex items-center gap-2 cursor-pointer">
                    <div className="flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold">
                      4
                    </div>
                    <h3 className="text-lg font-medium">
                      Advanced filters (optional)
                    </h3>
                  </summary>

                  <div className="ml-8 space-y-4">
                    <FormField
                      control={form.control}
                      name="extensions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>File types to process</FormLabel>
                          <FormControl>
                            <Input
                              placeholder=".docx,.pdf,.doc,.txt"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            File extensions (comma-separated)
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
                          <FormLabel>Files to ignore</FormLabel>
                          <FormControl>
                            <Input placeholder="temp,draft,~$" {...field} />
                          </FormControl>
                          <FormDescription>
                            Words in file names to exclude (comma-separated)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </details>
              )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Cancel
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
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create source
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>

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
