export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "NodeWave Deliverables Management API",
    version: "1.0.0",
    description: "Operational backbone for enterprise project deliverable management with state-based permissions, inter-task dependencies, optimistic locking concurrency control, and multi-tenant client isolation.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local Development Server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        summary: "System Health Check",
        tags: ["System"],
        security: [],
        responses: {
          200: { description: "API status is operational" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "User Authentication / Login",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "pm@nodewave.id" },
                  password: { type: "string", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Login successful with JWT access token" },
          400: { description: "Invalid credentials" },
        },
      },
    },
    "/api/auth/register": {
      post: {
        summary: "Register New Account",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name", "role", "department"],
                properties: {
                  email: { type: "string", example: "engineer@nodewave.id" },
                  password: { type: "string", example: "password123" },
                  name: { type: "string", example: "Engineer Name" },
                  role: { type: "string", enum: ["PRODUCT_MANAGER", "INTERNAL_TEAM", "CLIENT_GUEST"] },
                  department: { type: "string", enum: ["PRODUCT_MANAGEMENT", "UIUX", "FRONTEND", "BACKEND", "CLIENT"] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "User registered successfully" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        summary: "Get Authenticated User Profile",
        tags: ["Auth"],
        responses: {
          200: { description: "Current user profile" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/projects": {
      get: {
        summary: "List Accessible Projects",
        description: "Enforces tenant isolation: Client guests see only their projects; team members see assigned projects.",
        tags: ["Projects"],
        responses: {
          200: { description: "List of projects" },
        },
      },
      post: {
        summary: "Create New Project (PM Only)",
        tags: ["Projects"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "New Enterprise Project" },
                  description: { type: "string", example: "Project scope description" },
                  clientGuestId: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Project created" },
          403: { description: "Forbidden for non-PM users" },
        },
      },
    },
    "/api/projects/{id}": {
      get: {
        summary: "Get Project Details & Aggregate Progress Metrics",
        tags: ["Projects"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "Project details with aggregate progress metrics" },
          403: { description: "Forbidden - Multi-tenant isolation enforced" },
        },
      },
    },
    "/api/tasks": {
      get: {
        summary: "List Project Tasks with Dynamic Filtering (@nodewave/prisma-ezfilter)",
        description: "Supports standard query parameters: filters, searchFilters, rangedFilters, orderKey, orderRule, page, rows. Enforces data masking for Client Guests.",
        tags: ["Tasks"],
        parameters: [
          { name: "projectId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          { name: "filters", in: "query", schema: { type: "string" } },
          { name: "searchFilters", in: "query", schema: { type: "string" } },
          { name: "orderKey", in: "query", schema: { type: "string", default: "createdAt" } },
          { name: "orderRule", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "rows", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          200: { description: "List of tasks" },
        },
      },
      post: {
        summary: "Create Task (PM Only)",
        tags: ["Tasks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["projectId", "title", "description", "department"],
                properties: {
                  projectId: { type: "string", format: "uuid" },
                  title: { type: "string", example: "Task Title" },
                  description: { type: "string", example: "Task description details" },
                  department: { type: "string", enum: ["UIUX", "FRONTEND", "BACKEND", "PRODUCT_MANAGEMENT"] },
                  assigneeId: { type: "string", format: "uuid" },
                  isClientVisible: { type: "boolean", default: false },
                  prerequisiteIds: { type: "array", items: { type: "string", format: "uuid" } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Task created" },
        },
      },
    },
    "/api/tasks/{id}": {
      get: {
        summary: "Get Task Details with Prerequisites & Audit Trail",
        tags: ["Tasks"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "Task details" },
        },
      },
      patch: {
        summary: "Update Task (Concurrency Control & State Enforcement)",
        description: "Enforces optimistic locking via version. Enforces dependency completion prior to IN_PROGRESS transition. Forbids PMs from directly completing tasks to DONE.",
        tags: ["Tasks"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["version"],
                properties: {
                  version: { type: "integer", example: 1, description: "Mandatory optimistic locking version token" },
                  title: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] },
                  department: { type: "string", enum: ["UIUX", "FRONTEND", "BACKEND", "PRODUCT_MANAGEMENT"] },
                  assigneeId: { type: "string", format: "uuid" },
                  isClientVisible: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Task updated successfully, version incremented" },
          403: { description: "Forbidden by state-based or role-based permission" },
          409: { description: "Conflict detected - version mismatch between client and server" },
          422: { description: "Unprocessable entity - prerequisite tasks not completed" },
        },
      },
      delete: {
        summary: "Soft Delete Task (PM Only)",
        tags: ["Tasks"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "Task soft-deleted" },
        },
      },
    },
    "/api/tasks/{id}/attachments": {
      post: {
        summary: "Upload Work Attachment to Task",
        tags: ["Tasks"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fileName", "fileUrl", "fileSize"],
                properties: {
                  fileName: { type: "string", example: "design-v1.fig" },
                  fileUrl: { type: "string", example: "https://storage.nodewave.id/files/design-v1.fig" },
                  fileSize: { type: "integer", example: 1048576 },
                  fileType: { type: "string", example: "application/octet-stream" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Attachment added and audit log created" },
        },
      },
    },
    "/api/audit-logs": {
      get: {
        summary: "Get Project Audit Trail",
        description: "Immutable changelog recording field-level mutations, old values, new values, actors, and timestamps.",
        tags: ["Audit"],
        parameters: [
          { name: "projectId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          { name: "taskId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "List of audit trail records" },
          403: { description: "Forbidden for client guest users" },
        },
      },
    },
    "/api/standup-summary/{projectId}": {
      get: {
        summary: "Daily Standup Auto-Summary (Bonus Feature)",
        description: "Aggregates yesterday's completed deliverables and current blocked items grouped by department.",
        tags: ["Standup"],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "Daily standup structured summary per department" },
          403: { description: "Forbidden for client guest users" },
        },
      },
    },
  },
};
