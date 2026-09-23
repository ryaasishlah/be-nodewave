# NodeWave Deliverables Management Service

Backend API service for managing enterprise project deliverables across cross-functional teams (Product Management, UI/UX, Frontend, and Backend) and client stakeholders.

---

## Overview

This service acts as the central state machine and data store for tracking complex, interdependent project tasks. It is designed to handle:
- **State-based authorization (ABAC)** where action validity depends on current task state, actor role, and department.
- **Inter-task dependency resolution** preventing work from starting until prerequisite deliverables are finished.
- **Optimistic concurrency control** preventing race conditions and data overwrites during simultaneous edits.
- **Immutable audit logging** with full field-level change history and soft deletion.
- **Multi-tenant data masking** ensuring external client guests can only view high-level progress without leaking internal engineering identities.

---

## Technology Stack

- **Runtime**: [Bun](https://bun.sh) (v1.2+)
- **Language**: TypeScript (Strict Mode)
- **HTTP Framework**: [Hono](https://hono.dev)
- **Database**: PostgreSQL (v16+)
- **ORM**: [Prisma](https://www.prisma.io) (v6.19)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`) with password hashing (`bcryptjs`)
- **Query Filtering & Pagination**: `@nodewave/prisma-ezfilter`
- **Schema Validation**: [Zod](https://zod.dev)
- **Documentation**: OpenAPI 3.0 via `@hono/swagger-ui`
- **Testing**: Built-in Bun Test runner (`bun test`)

---

## Core Business Logic Implementation

### 1. State-Based Access Control (RBAC + ABAC)

Access permissions are evaluated dynamically based on actor role, department, and current entity state:

- **Product Manager (PM)**:
  - Has full read and write access across projects and deliverables.
  - Can define and alter dependency graphs between tasks.
  - **Constraint**: Cannot directly move a task from `IN_PROGRESS` to `DONE`. Only assigned executors can mark deliverables as complete. Requests violating this return `403 Forbidden`.

- **Internal Engineering (UI/UX, Frontend, Backend)**:
  - Read access is restricted to projects where the engineer is an assigned member.
  - Can update task status and attach work deliverables.
  - **Constraint**: Cannot modify core task attributes (title and description). Requests attempting to edit task specifications return `403 Forbidden`.

- **Client Guest**:
  - Enforces strict multi-tenant isolation.
  - Can only query assigned client projects.
  - Can only view tasks explicitly marked as `isClientVisible = true`.
  - **Data Masking**: All internal identities (engineer names, emails, avatars, departments) and internal attachments/audit logs are sanitized at the service layer before the HTTP response is constructed.

### 2. Inter-Task Dependency Resolution

- Tasks can define one or more prerequisites via the `TaskDependency` junction model.
- If a task has unfinished prerequisites, its computed state is evaluated as `BLOCKED`.
- When an engineer attempts to transition a task to `IN_PROGRESS`, the system verifies whether all dependent tasks have reached `DONE` status. If any prerequisite remains incomplete, the mutation is rejected with `422 Unprocessable Entity`.

### 3. Concurrency Control & Optimistic Locking

- Every task record maintains an integer `version` field, initialized to `1`.
- Update payloads must submit the currently observed `version` token.
- Before executing mutations, the service validates whether `currentTask.version === submittedVersion`.
- If a version mismatch is detected (indicating another actor committed a change in the interim), the transaction is aborted and a `409 Conflict` error is returned.
- On successful update, the version counter is incremented atomically (`version: { increment: 1 }`).

### 4. Immutable Audit Trail & Soft Deletion

- Physical deletes are prohibited. Deletions set `deletedAt = NOW()`.
- Every field modification (`status`, `title`, `description`, `assigneeId`, attachments) is recorded inside an atomic Prisma transaction (`$transaction`).
- Audit entries capture: `projectId`, `taskId`, `userId`, `action`, `changedColumn`, `oldValue`, `newValue`, and `timestamp`.

### 5. Dynamic Filtering with `@nodewave/prisma-ezfilter`

The `GET /api/tasks` endpoint integrates `@nodewave/prisma-ezfilter` to support standard query parameter contracts:
- `filters`: Exact match key-value filters.
- `searchFilters`: Text search filters using case-insensitive containment.
- `rangedFilters`: Date and numeric ranges.
- `orderKey` / `orderRule`: Field-level sorting (`asc` / `desc`).
- `page` / `rows`: Standard pagination with total row counts.

### 6. Daily Standup Auto-Summary (Bonus Feature)

The `GET /api/standup-summary/:projectId` endpoint analyzes audit log entries from the preceding 24 hours alongside currently blocked items, producing a structured JSON report grouped by department (`UIUX`, `FRONTEND`, `BACKEND`, `PRODUCT_MANAGEMENT`):
- `completedYesterday`: Deliverables moved to `DONE` within the past 24 hours with actor attribution.
- `blockedToday`: Deliverables currently blocked, including active prerequisite dependencies and assignees.

---

## Seed Accounts & Credentials

The database seeder provisions 5 accounts covering all roles and departments. All accounts share the password: `password123`.

| Role | Department | Email | Password | Permissions Summary |
| :--- | :--- | :--- | :--- | :--- |
| **Product Manager** | `PRODUCT_MANAGEMENT` | `pm@nodewave.id` | `password123` | Full project/task admin. Cannot set `DONE`. |
| **UI/UX Engineer** | `UIUX` | `uiux@nodewave.id` | `password123` | Project member. Status and attachment updates. |
| **Frontend Engineer** | `FRONTEND` | `fe@nodewave.id` | `password123` | Project member. Status and attachment updates. |
| **Backend Engineer** | `BACKEND` | `be@nodewave.id` | `password123` | Project member. Status and attachment updates. |
| **Client Guest** | `CLIENT` | `client@nodewave.id` | `password123` | Tenant-isolated. Progress metrics and masked visible tasks only. |

---

## Local Development Setup

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- [PostgreSQL](https://www.postgresql.org/) (v16+)

### 1. Installation

```bash
bun install
```

### 2. Environment Configuration

Copy the example environment file and adjust database credentials as needed:

```bash
cp .env.example .env
```

Default configuration:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nodewave_db?schema=public"
JWT_SECRET="nodewave_super_secret_jwt_key_2026"
NODE_ENV=development
```

### 3. Database Migration & Seeding

```bash
# Execute schema migration against PostgreSQL
bun run db:migrate

# Populate seed users, sample project, and interdependent deliverables
bun run db:seed
```

### 4. Running the Service

```bash
# Development mode with hot-reloading
bun run dev

# Production build
bun run build
bun run start
```

The service listens on `http://localhost:5000`.

---

## Automated Testing

Run the automated test suite using Bun's built-in test runner:

```bash
bun test
```

Test coverage includes:
- Inter-task dependency blocking (verifying `422` status on incomplete prerequisites).
- Concurrency version mismatch detection (verifying `409 Conflict` on stale tokens).
- State-based PM completion restriction (verifying `403 Forbidden` when PM marks `DONE`).
- Tenant isolation and response data masking for `CLIENT_GUEST`.

---

## API Documentation & Tooling

### Interactive Swagger UI

Interactive OpenAPI documentation is served directly by the application:
- **Swagger UI**: [http://localhost:5000/docs](http://localhost:5000/docs)
- **OpenAPI 3.0 Specification**: [http://localhost:5000/docs/openapi.json](http://localhost:5000/docs/openapi.json)

### Postman Collection

Pre-configured Postman assets are available in the repository root:
- Collection: `nodewave-api.postman_collection.json`
- Environment: `nodewave-local.postman_environment.json`

Import both files into Postman to test authentication workflows, project isolation, and task lifecycle operations.

---

## Directory Structure

```
be-nodewave/
├── prisma/
│   ├── schema.prisma              # Database models, relations, and enums
│   ├── seed.ts                    # Account and sample data seeder
│   └── migrations/                # Version-controlled SQL migrations
├── src/
│   ├── index.ts                   # Application entrypoint and route mounting
│   ├── lib/
│   │   └── prisma.ts              # PrismaClient singleton
│   ├── middlewares/
│   │   ├── auth.middleware.ts     # JWT validation and user context injection
│   │   └── error.middleware.ts    # Global exception and validation error handler
│   ├── docs/
│   │   └── openapi.ts             # OpenAPI 3.0 specification
│   └── modules/
│       ├── auth/                  # Authentication endpoints and services
│       ├── projects/              # Project management and tenant isolation
│       ├── tasks/                 # Deliverables, dependencies, and locking logic
│       ├── audit/                 # Immutable audit log queries
│       └── standup/               # Daily standup auto-summary generator
├── tests/
│   └── task.test.ts               # Automated integration and business logic tests
├── package.json
└── tsconfig.json
```
