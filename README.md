# Doc2AI

Automatically convert documents from Google Drive and SharePoint to Markdown, with continuous change monitoring.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running

## Getting started

### 1. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

- **Google Drive** &mdash; `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (create them in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials))
- **SharePoint / OneDrive** &mdash; `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` (register an app in the [Azure portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade))
- **Security** &mdash; generate random values for `JWT_SECRET` and `ENCRYPTION_KEY`:
  ```bash
  openssl rand -base64 32
  ```

### 2. Start the application

```bash
./start.sh
```

This single command builds and starts all services (backend, frontend, Redis). It takes about 30 seconds on the first run.

### 3. Open the app

Go to **http://localhost:5173** in your browser.

From there you can:

1. Connect a cloud drive (Google Drive or SharePoint) via OAuth
2. Choose which folders to monitor and where to export the Markdown files
3. Let the monitoring service automatically detect changes and convert new documents

## Useful commands

| Command | Description |
|---|---|
| `./start.sh` | Full rebuild and start |
| `docker compose up -d` | Start without rebuilding |
| `docker compose down` | Stop all services |
| `docker compose logs -f` | Follow live logs |
| `docker compose logs -f backend` | Follow backend logs only |

## Supported formats

| Source format | Output |
|---|---|
| DOCX / DOC | Markdown |
| PDF | Markdown |
| Google Docs | Markdown (exported then converted) |

## Project structure

```
backend/          Node.js / Express API with Prisma ORM
frontend/         React SPA (TypeScript, Vite, shadcn/ui)
docker-compose.yml
start.sh          One-command startup script
.env.example      Template for environment variables
```

## API overview

The backend exposes a REST API at `http://localhost:3000/api`:

- **`/api/sources`** &mdash; manage connected cloud drives
- **`/api/conversions`** &mdash; trigger and track document conversions
- **`/api/monitoring`** &mdash; start/stop the automatic change watcher
- **`/api/auth`** &mdash; OAuth callbacks for Google and Microsoft
