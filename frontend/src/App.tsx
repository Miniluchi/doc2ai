import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Settings, FileText, Cloud, Download, Activity } from 'lucide-react'
import './App.css'

interface DocumentSource {
  name: string
  platform: string
  status: string
  sourcePath: string
  destination: string
  lastSync?: string
}

function App() {
  const [sources] = useState<DocumentSource[]>([])

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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500" />
                Connected Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{sources.length}</div>
              <p className="text-sm text-muted-foreground">Document sources configured</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-green-500" />
                Files Converted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-sm text-muted-foreground">Documents processed to Markdown</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-orange-500" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">Idle</Badge>
              <p className="text-sm text-muted-foreground mt-2">No active conversions</p>
            </CardContent>
          </Card>
        </div>

        {/* Document Sources Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Document Sources</h2>
              <p className="text-muted-foreground">Configure your cloud drives and document repositories</p>
            </div>
            <Button>
              <Plus className="h-4 w-4" />
              Add Source
            </Button>
          </div>

          {/* Empty State */}
          {sources.length === 0 && (
            <Card className="p-12 text-center">
              <CardContent>
                <Cloud className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <CardTitle className="mb-2">No Document Sources Yet</CardTitle>
                <CardDescription className="mb-6 max-w-md mx-auto">
                  Get started by connecting your first document source. Support for Microsoft SharePoint, 
                  Google Drive, and other cloud storage platforms.
                </CardDescription>
                <Button size="lg">
                  <Plus className="h-4 w-4" />
                  Add Your First Source
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Sources List (when not empty) */}
          {sources.length > 0 && (
            <div className="grid gap-4">
              {sources.map((source, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Cloud className="h-5 w-5 text-blue-500" />
                        <div>
                          <CardTitle>{source.name}</CardTitle>
                          <CardDescription>{source.platform}</CardDescription>
                        </div>
                      </div>
                      <CardAction>
                        <Badge variant="outline">{source.status}</Badge>
                      </CardAction>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Source Path:</span>
                        <code className="bg-muted px-2 py-1 rounded text-xs">{source.sourcePath}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Destination:</span>
                        <code className="bg-muted px-2 py-1 rounded text-xs">{source.destination}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Last Sync:</span>
                        <span>{source.lastSync || 'Never'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>Doc2AI - Automated Documentation Converter for Developers</p>
            <p>Self-hosted • Secure • AI-Ready</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
