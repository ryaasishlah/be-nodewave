import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./modules/auth/auth.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { projectRoutes } from "./modules/projects/project.routes";
import { taskRoutes } from "./modules/tasks/task.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { standupRoutes } from "./modules/standup/standup.routes";

const app = new Hono();

// 1. Middlewares global (selalu paling atas)
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// 2. Global Error Handler
app.onError(errorHandler);

// 3. Root & Health Endpoints
app.get("/", (c) =>
  c.json({
    name: "NodeWave Deliverables Management API",
    version: "1.0.0",
    status: "online",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
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

// 4. Mount Routes
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
