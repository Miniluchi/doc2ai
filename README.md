# Doc2AI

Automatically convert documents from Google Drive and SharePoint to Markdown, with continuous change monitoring.

> **Note (v0.1.0)** &mdash; only **Google Drive** is functional in this release. SharePoint / OneDrive support is configured but not yet operational.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running

## Getting started

### 1. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

- **Google Drive** &mdash; `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (create them in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials))
- **SharePoint / OneDrive** &mdash; `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` (register an app in the [Azure portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)) &mdash; *not operational in v0.1.0, can be left blank*
- **Security** &mdash; generate random values for `JWT_SECRET` and `ENCRYPTION_KEY`:
  ```bash
  openssl rand -base64 32
  ```

### 2. Start the application

```bash
docker compose up -d
```

This command builds (if needed) and starts all services (backend, frontend, Redis) in the background. The first run takes about 30 seconds while images are built; subsequent starts are nearly instant.

### 3. Open the app

Go to **http://localhost:5173** in your browser.

From there you can:

1. Connect a Google Drive account via OAuth (SharePoint / OneDrive coming in a later release)
2. Choose which folders to monitor and where to export the Markdown files
3. Let the monitoring service automatically detect changes and convert new documents

## Useful commands

| Command | Description |
|---|---|
| `docker compose up -d` | Start all services (builds images if needed) |
| `docker compose --profile monitoring up -d` | Same, plus the optional supervision dashboard on http://localhost:3001 |
| `docker compose down` | Stop all services |
| `docker compose logs -f` | Follow live logs |
| `docker compose logs -f backend` | Follow backend logs only |

## Supported formats

| Source format | Output |
|---|---|
| DOCX / DOC | Markdown |
| PDF | Markdown |
| Google Docs | Markdown (exported then converted) |
