import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Plus, TestTube, CheckCircle, XCircle } from 'lucide-react'
import type { CreateSourceRequest, ConnectionTestResult } from '../../types/api'
import { useSources } from '../../hooks/useSources'
import { sourcesApi } from '../../services/api'

// Schéma de validation Zod
const sourceFormSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(100, 'Le nom est trop long'),
  platform: z.enum(['sharepoint', 'googledrive', 'onedrive'], {
    errorMap: () => ({ message: 'Veuillez sélectionner une plateforme' }),
  }),
  sourcePath: z.string().min(1, 'Le chemin source est requis'),
  siteUrl: z.string().url('URL invalide').optional().or(z.literal('')),
  destinations: z.string().min(1, 'Au moins un dossier de destination est requis'),
  
  // Credentials SharePoint/OneDrive - Optional par défaut mais validées conditionnellement
  microsoftClientId: z.string().optional(),
  microsoftClientSecret: z.string().optional(),
  microsoftTenantId: z.string().optional(),
  
  // Credentials Google Drive - Optional par défaut mais validées conditionnellement  
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  googleRefreshToken: z.string().optional(),

  // Extensions supportées
  extensions: z.string().optional(),
  excludePatterns: z.string().optional(),
}).superRefine((data, ctx) => {
  // Validation conditionnelle selon la plateforme avec messages d'erreur spécifiques
  if (data.platform === 'sharepoint' || data.platform === 'onedrive') {
    if (!data.microsoftClientId || data.microsoftClientId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Client ID Microsoft est requis',
        path: ['microsoftClientId']
      })
    }
    if (!data.microsoftClientSecret || data.microsoftClientSecret.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Client Secret Microsoft est requis',
        path: ['microsoftClientSecret']
      })
    }
    if (!data.microsoftTenantId || data.microsoftTenantId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Tenant ID Microsoft est requis',
        path: ['microsoftTenantId']
      })
    }
  }
  
  if (data.platform === 'googledrive') {
    if (!data.googleClientId || data.googleClientId.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Client ID Google est requis',
        path: ['googleClientId']
      })
    }
    if (!data.googleClientSecret || data.googleClientSecret.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Client Secret Google est requis',
        path: ['googleClientSecret']
      })
    }
    if (!data.googleRefreshToken || data.googleRefreshToken.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le Refresh Token Google est requis',
        path: ['googleRefreshToken']
      })
    }
  }
})

type SourceFormData = z.infer<typeof sourceFormSchema>

interface AddSourceDialogProps {
  children: React.ReactNode
  onSourceAdded?: () => void
}

export function AddSourceDialog({ children, onSourceAdded }: AddSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [createdSourceId, setCreatedSourceId] = useState<string | null>(null)
  const [useDefaultCredentials, setUseDefaultCredentials] = useState(true)

  const { createSource } = useSources()

  const form = useForm<SourceFormData>({
    resolver: zodResolver(sourceFormSchema),
    defaultValues: {
      name: '',
      platform: undefined,
      sourcePath: '/',
      siteUrl: '',
      destinations: '',
      extensions: '.docx,.pdf,.doc',
      excludePatterns: '',
      // Pré-remplir avec les credentials par défaut
      googleClientId: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_ID || '',
      googleClientSecret: import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_SECRET || '',
      microsoftClientId: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_ID || '',
      microsoftClientSecret: import.meta.env.VITE_DEFAULT_MICROSOFT_CLIENT_SECRET || '',
      microsoftTenantId: import.meta.env.VITE_DEFAULT_MICROSOFT_TENANT_ID || '',
    },
  })

  const selectedPlatform = form.watch('platform')

  const onSubmit = async (data: SourceFormData) => {
    console.log('Form onSubmit called with data:', data)
    try {
      setIsSubmitting(true)
      setTestResult(null)

      // Préparer les credentials selon la plateforme
      let credentials: any = {}
      if (data.platform === 'sharepoint' || data.platform === 'onedrive') {
        credentials = {
          clientId: data.microsoftClientId!.trim(),
          clientSecret: data.microsoftClientSecret!.trim(),
          tenantId: data.microsoftTenantId!.trim(),
        }
      } else if (data.platform === 'googledrive') {
        credentials = {
          clientId: data.googleClientId!.trim(),
          clientSecret: data.googleClientSecret!.trim(),
          refreshToken: data.googleRefreshToken!.trim(),
        }
      }

      // Préparer les destinations (séparées par des virgules)
      const destinations = data.destinations
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0)

      // Préparer les extensions et patterns
      const extensions = data.extensions
        ?.split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0) || ['.docx', '.pdf', '.doc']

      const excludePatterns = data.excludePatterns
        ?.split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0) || []

      const sourceData: CreateSourceRequest = {
        name: data.name,
        platform: data.platform,
        config: {
          credentials,
          sourcePath: data.sourcePath,
          ...(data.platform === 'sharepoint' && data.siteUrl && { siteUrl: data.siteUrl }),
          destinations,
          filters: {
            extensions,
            excludePatterns,
          },
        },
      }

      console.log('About to call createSource with:', sourceData)
      const newSource = await createSource(sourceData)
      console.log('createSource completed successfully:', newSource)
      setCreatedSourceId(newSource.id)
      
      // Fermer le dialog et reset le formulaire
      setOpen(false)
      form.reset()
      onSourceAdded?.()

    } catch (error) {
      console.error('Error creating source:', error)
      // Afficher l'erreur à l'utilisateur
      if (error instanceof Error) {
        form.setError('platform', { 
          message: error.message || 'Erreur lors de la création de la source' 
        })
      } else {
        form.setError('platform', { 
          message: 'Erreur inconnue lors de la création de la source' 
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const testConnection = async () => {
    if (!createdSourceId) return

    try {
      setIsTesting(true)
      const result = await sourcesApi.testConnection(createdSourceId)
      setTestResult(result)
    } catch (error) {
      console.error('Error testing connection:', error)
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erreur de connexion'
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une Source Documentaire</DialogTitle>
          <DialogDescription>
            Configurez une nouvelle source pour synchroniser automatiquement vos documents.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={(e) => {
              console.log('Form submit event triggered')
              form.handleSubmit(onSubmit)(e)
            }} 
            className="space-y-6"
          >
            {/* Informations générales */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Informations générales</h3>
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom de la source</FormLabel>
                    <FormControl>
                      <Input placeholder="Mon SharePoint d'entreprise" {...field} />
                    </FormControl>
                    <FormDescription>
                      Nom descriptif pour identifier cette source
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
                    <FormLabel>Plateforme</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionnez une plateforme" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sharepoint">Microsoft SharePoint</SelectItem>
                        <SelectItem value="onedrive">Microsoft OneDrive</SelectItem>
                        <SelectItem value="googledrive">Google Drive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Configuration des chemins */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Configuration des chemins</h3>
              
              <FormField
                control={form.control}
                name="sourcePath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chemin source</FormLabel>
                    <FormControl>
                      <Input placeholder="/Documents/Guides" {...field} />
                    </FormControl>
                    <FormDescription>
                      Chemin du dossier à surveiller (/ pour la racine)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedPlatform === 'sharepoint' && (
                <FormField
                  control={form.control}
                  name="siteUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL du site SharePoint</FormLabel>
                      <FormControl>
                        <Input placeholder="https://company.sharepoint.com/sites/docs" {...field} />
                      </FormControl>
                      <FormDescription>
                        URL complète du site SharePoint
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
                    <FormLabel>Dossiers de destination</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="/Users/john/docs, /workspace/documentation"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Dossiers locaux où copier les fichiers convertis (séparés par des virgules)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Credentials */}
            {selectedPlatform && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    Authentification {selectedPlatform === 'googledrive' ? 'Google' : 'Microsoft'}
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUseDefaultCredentials(!useDefaultCredentials)}
                  >
                    {useDefaultCredentials ? 'Credentials personnalisés' : 'Credentials par défaut'}
                  </Button>
                </div>
                {useDefaultCredentials && (
                  <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    ✓ Utilise les credentials configurés par défaut dans l'application
                  </div>
                )}

                {(selectedPlatform === 'sharepoint' || selectedPlatform === 'onedrive') && !useDefaultCredentials && (
                  <>
                    <FormField
                      control={form.control}
                      name="microsoftClientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client ID</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Application (client) ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="microsoftClientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Secret</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Client secret value" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="microsoftTenantId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tenant ID</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Directory (tenant) ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {selectedPlatform === 'googledrive' && !useDefaultCredentials && (
                  <>
                    <FormField
                      control={form.control}
                      name="googleClientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client ID Google</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Google OAuth Client ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="googleClientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Secret Google</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Google OAuth Client Secret" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Refresh Token toujours requis pour Google Drive */}
                {selectedPlatform === 'googledrive' && (
                  <FormField
                    control={form.control}
                    name="googleRefreshToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refresh Token (Requis)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Google OAuth Refresh Token" {...field} />
                        </FormControl>
                        <FormDescription>
                          Token nécessaire pour accéder à votre Google Drive
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Instructions pour le refresh token Google Drive */}
                {selectedPlatform === 'googledrive' && (
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
                    <h4 className="font-medium text-blue-900 mb-2">📝 Comment obtenir votre Refresh Token Google</h4>
                    <div className="text-sm text-blue-800 space-y-2">
                      <p><strong>1.</strong> Visitez cette URL dans votre navigateur :</p>
                      <code className="block bg-white p-2 rounded text-xs break-all">
                        https://accounts.google.com/o/oauth2/v2/auth?client_id={import.meta.env.VITE_DEFAULT_GOOGLE_CLIENT_ID}&redirect_uri=http://localhost:3000/api/auth/google/callback&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent
                      </code>
                      <p><strong>2.</strong> Autorisez l'accès à votre Google Drive</p>
                      <p><strong>3.</strong> Récupérez le code d'autorisation depuis l'URL de redirection</p>
                      <p><strong>4.</strong> Utilisez ce code pour obtenir le refresh token via curl ou Postman</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filtres */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Filtres de fichiers</h3>
              
              <FormField
                control={form.control}
                name="extensions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extensions supportées</FormLabel>
                    <FormControl>
                      <Input placeholder=".docx,.pdf,.doc" {...field} />
                    </FormControl>
                    <FormDescription>
                      Extensions de fichiers à traiter (séparées par des virgules)
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
                    <FormLabel>Patterns d'exclusion</FormLabel>
                    <FormControl>
                      <Input placeholder="temp,draft,~$" {...field} />
                    </FormControl>
                    <FormDescription>
                      Patterns regex pour exclure des fichiers (séparés par des virgules)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Test de connexion */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {testResult.success ? 'Connexion réussie' : 'Échec de la connexion'}
                  </span>
                </div>
                <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.message}
                </p>
                {testResult.details && (
                  <div className="mt-2 text-xs space-y-1">
                    {testResult.details.platform && (
                      <Badge variant="outline">{testResult.details.platform}</Badge>
                    )}
                    {testResult.details.filesFound !== undefined && (
                      <span className="text-muted-foreground">
                        {testResult.details.filesFound} fichiers trouvés
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Boutons d'action */}
            <div className="flex justify-between pt-4">
              {createdSourceId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={testConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube className="mr-2 h-4 w-4" />
                  )}
                  Tester la connexion
                </Button>
              )}
              
              <div className="flex gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  onClick={(e) => {
                    console.log('Submit button clicked')
                    console.log('Form errors:', form.formState.errors)
                    console.log('Form is valid:', form.formState.isValid)
                    console.log('Form values:', form.getValues())
                  }}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Créer la source
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}