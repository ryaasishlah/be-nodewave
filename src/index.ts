import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { swaggerUI } from "@hono/swagger-ui";
import { openApiSpec } from "./docs/openapi";
import { authRoutes } from "./modules/auth/auth.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { projectRoutes } from "./modules/projects/project.routes";
import { taskRoutes } from "./modules/tasks/task.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { standupRoutes } from "./modules/standup/standup.routes";

const app = new Hono();

// Global middlewares
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Global error handler
app.onError(errorHandler);

// Health and root discovery endpoints
app.get("/", (c) =>
  c.json({
    name: "NodeWave Deliverables Management API",
    version: "1.0.0",
    status: "online",
    documentation: "/docs",
    openapi: "/docs/openapi.json",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      projects: "/api/projects",
      tasks: "/api/tasks",
      auditLogs: "/api/audit-logs",
      standupSummary: "/api/standup-summary",
    },
  })
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    message: "NodeWave API is healthy",
    timestamp: new Date().toISOString(),
  })
);

// Swagger Documentation
app.get("/docs/openapi.json", (c) => c.json(openApiSpec));
app.get("/docs", swaggerUI({ url: "/docs/openapi.json" }));

// API route registrations
app.route("/api/auth", authRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/audit-logs", auditRoutes);
app.route("/api/standup-summary", standupRoutes);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
