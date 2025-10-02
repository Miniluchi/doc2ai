# Doc2AI

is a web application that automates document conversion from cloud drives (Google Drive, SharePoint) to Markdown format, with continuous change monitoring.

## Overview

Doc2AI allows you to connect your cloud drives and automatically convert your documents (DOCX, DOC, PDF) to Markdown. The application continuously monitors your connected sources and automatically processes new files or modifications.

### Key Features

- **OAuth integration** with Google Drive and Microsoft SharePoint
- **Automatic conversion** of documents to Markdown (DOCX/DOC/PDF → Markdown)
- **Continuous monitoring** of changes in connected drives
- **French user interface** with conversion task management
- **Configured export** to specific local folders

### Technical Architecture

**Backend**

- Node.js/Express with layered architecture
- SQLite database with Prisma ORM
- Redis for asynchronous task management
- Factory pattern system for connectors and converters

**Frontend**

- React SPA with TypeScript and Vite
- Modern interface with shadcn/ui
- Custom hooks for state management

**Infrastructure**

- Fully containerized application with Docker
- Automatic database migration
- Persistent volumes for storage

### Data Flow

1. OAuth authentication with cloud providers
2. Drive source configuration in the interface
3. Monitoring service that detects changes
4. Asynchronous document conversion pipeline
5. Local storage of converted Markdown files

### Security

- Encryption of OAuth credentials in database
- JWT authentication for the API
- Rate limiting and CORS configuration
- Network isolation via Docker

The application is designed for a containerized development workflow with an automated startup script (`./start.sh`) that handles complete environment rebuild and restart.
