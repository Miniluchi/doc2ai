# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start (Recommended)

- **Complete startup script**: `./start.sh`
  - Stops existing containers
  - Rebuilds without cache
  - Starts in background
  - Shows real-time logs

### Docker (Containerized - Main Configuration)

- **Quick start**: `./start.sh` (equivalent to the complete sequence below)
- **Start**: `docker compose up -d`
- **Rebuild**: `docker compose up --build`
- **Stop**: `docker compose down`
- **Real-time logs**: `docker compose logs -f`
- **Complete rebuild without cache**: `docker compose build --no-cache`

### Local Development (if needed)

#### Backend (Node.js/Express)

- **Development**: `cd backend && npm run dev` (uses nodemon)
- **Production**: `cd backend && npm start`
- **Database**:
  - `cd backend && npm run prisma:generate` (generate Prisma client)
  - `cd backend && npm run prisma:migrate` (run migrations)
  - `cd backend && npm run prisma:studio` (database GUI)
- **Linting**: `cd backend && npm run lint`
- **Testing**: `cd backend && npm test`

#### Frontend (React + TypeScript + Vite)

- **Development**: `cd frontend && npm run dev`
- **Build**: `cd frontend && npm run build` (includes TypeScript compilation)
- **Linting**: `cd frontend && npm run lint`
- **Preview**: `cd frontend && npm preview`

## Architecture Overview

### Backend Architecture

The backend follows a layered architecture pattern:

- **`src/controllers/`** - HTTP request handlers and response formatting
- **`src/services/`** - Business logic and orchestration layer
- **`src/integrations/`** - External platform connectors (Google Drive, SharePoint)
  - Factory pattern: `DriveConnectorFactory` creates appropriate connectors
  - Base class: `DriveConnector` defines common interface
- **`src/converters/`** - Document conversion engines
  - Factory pattern: `ConverterFactory` selects converter by file type
  - Base class: `BaseConverter` defines conversion interface
  - Supports: DOCX/DOC → Markdown, PDF → Markdown
- **`src/middleware/`** - Express middleware (auth, validation, error handling)
- **`src/routes/`** - API route definitions
- **`src/config/`** - Configuration and database setup

### Frontend Architecture

React SPA using modern TypeScript patterns:

- **`src/components/ui/`** - shadcn/ui reusable components
- **`src/components/`** - Application-specific components
- **`src/hooks/`** - Custom React hooks for data fetching and state
- **`src/services/`** - API client and external service integrations
- **`src/types/`** - TypeScript type definitions
- **`src/pages/`** - Page components (AuthCallback)

### Key Data Flow

1. **OAuth Integration**: Users authenticate with cloud providers (Google/Microsoft)
2. **Source Management**: Connected drives are stored as `Source` entities
3. **Monitoring Service**: Polls sources for changes, creates `ConversionJob`s
4. **Conversion Pipeline**: Jobs processed through appropriate converter
5. **Storage**: Converted markdown stored locally, tracked in `ConvertedFile`

### Database Schema (Prisma)

- **Source**: Cloud drive configurations and credentials (encrypted)
- **ConversionJob**: Async conversion tasks with status tracking
- **SyncLog**: Audit trail of synchronization activities
- **ConvertedFile**: Index of successfully converted documents

## Integration Patterns

### Adding New Cloud Platform

1. Create connector in `backend/src/integrations/[platform]/`
2. Extend `DriveConnectorFactory` to handle new platform type
3. Implement OAuth flow in frontend with new auth button component
4. Add platform validation in `middleware/validation.js`

### Adding New Document Format

1. Create converter in `backend/src/converters/[format]Converter.js`
2. Extend `ConverterFactory` to map file extensions to converter
3. Implement `BaseConverter` interface with `convert()` method
4. Add format validation and MIME type handling

## Docker Architecture

### Services Stack

- **Backend**: Node.js/Express API (Port 3000)
- **Frontend**: React/Vite served by Nginx (Port 5173)
- **Redis**: Cache and job queue (Port 6379)
- **Database**: SQLite embedded in backend container

### Docker Features

- **Multi-stage build** for frontend (build → nginx)
- **Auto-migration** of DB on backend startup (`npx prisma db push`)
- **Persistent volumes** for storage, temp files and database
- **Network isolation** with `doc2ai-network`

## Environment Configuration

Configuration is centralized in `.env` at project root:

### Main Variables

```env
# Ports
BACKEND_PORT=3000
FRONTEND_PORT=5173
REDIS_PORT=6379

# Database
DATABASE_URL="file:./dev.db"

# Security
JWT_SECRET="your-jwt-secret"
ENCRYPTION_KEY="your-32-char-key"
# For encrypting OAuth credentials

# Microsoft Graph API
MICROSOFT_CLIENT_ID="..."
MICROSOFT_CLIENT_SECRET="..."
MICROSOFT_TENANT_ID="..."

# Google Drive API
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

# Redis
REDIS_URL="redis://redis:6379"

# Monitoring
SYNC_INTERVAL_MINUTES=15
LOG_LEVEL=info
```

## Testing Strategy

### Docker Workflow (Recommended)

- **Development**: Use `./start.sh` for complete environment
- **Container tests**: `docker compose exec backend npm test`
- **Container linting**:
  - Backend: `docker compose exec backend npm run lint`
  - Frontend: `docker compose exec frontend npm run lint`
- **Database operations**: `docker compose exec backend npx prisma studio`

### Local Development

- Backend: Jest for unit tests (`npm test` in backend/)
- Always run linting before committing: `npm run lint` in both directories
- Database changes require running `npm run prisma:migrate` in backend/
- Frontend builds must pass TypeScript compilation: `npm run build`

### Pre-commit Validation

1. `./start.sh` to verify everything starts correctly
2. Check logs with `docker compose logs -f`
3. Test main API endpoints
4. Validate user interface on http://localhost:5173

## Key Services

### MonitoringService

- Auto-starts in production mode
- Polls connected sources for document changes
- Creates conversion jobs for new/modified files
- Manual control via `/api/monitoring/start|stop`

### ConversionService

- Handles async document processing
- Manages job queue and status updates
- Cleans up temporary files after conversion
- Supports progress tracking for large files

### OAuth Security

- Credentials encrypted in database using `ENCRYPTION_KEY`
- JWT tokens for API authentication
- Rate limiting on API endpoints
- CORS configured for frontend origin only

## Development Notes

### Project Specifics

- **French user interface**: The application uses French content in the UI
- **Containerized workflow**: Development is primarily done via Docker
- **Startup script**: `./start.sh` automates the complete rebuild/restart cycle
- **Centralized configuration**: Single `.env` file at root for all services

### Development URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **Prisma Studio**: Accessible via `docker compose exec backend npx prisma studio`
- **Redis**: localhost:6379 (if direct access needed)

### Debugging

- **Real-time logs**: `docker compose logs -f [service_name]`
- **Shell access**: `docker compose exec [service_name] sh`
- **Database inspection**: `docker compose exec backend npx prisma studio`
