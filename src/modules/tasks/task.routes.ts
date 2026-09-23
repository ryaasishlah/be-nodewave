import { Hono } from "hono";
import { TaskService } from "./task.service";
import { createTaskSchema, updateTaskSchema, createAttachmentSchema } from "./task.dto";
import { authMiddleware } from "../../middlewares/auth.middleware";

export const taskRoutes = new Hono();

taskRoutes.use("*", authMiddleware);

// GET /api/tasks?projectId=...&filters=...&searchFilters=...
taskRoutes.get("/", async (c) => {
  const user = c.get("user");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    return c.json({ success: false, message: "Query parameter 'projectId' is required" }, 400);
  }

  try {
    const tasks = await TaskService.listTasks(projectId, c.req.query(), user);
    return c.json({ success: true, data: tasks });
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 400;
    return c.json({ success: false, message: error.message }, status);
  }
});

// GET /api/tasks/:id
taskRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");

  try {
    const task = await TaskService.getTaskById(taskId, user);
    return c.json({ success: true, data: task });
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 404;
    return c.json({ success: false, message: error.message }, status);
  }
});

// POST /api/tasks (PM only)
taskRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const validated = createTaskSchema.parse(body);

  try {
    const task = await TaskService.createTask(validated, user);
    return c.json({ success: true, message: "Task created successfully", data: task }, 201);
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 400;
    return c.json({ success: false, message: error.message }, status);
  }
});

// PATCH /api/tasks/:id (Concurrency 409 & State Rules)
taskRoutes.patch("/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  const body = await c.req.json();
  const validated = updateTaskSchema.parse(body);

  try {
    const task = await TaskService.updateTask(taskId, validated, user);
    return c.json({ success: true, message: "Task updated successfully", data: task });
  } catch (error: any) {
    const status = error.status || (error.message.includes("Forbidden") ? 403 : 400);
    return c.json({ success: false, message: error.message }, status);
  }
});

// DELETE /api/tasks/:id (Soft delete - PM only)
taskRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");

  try {
    const result = await TaskService.deleteTask(taskId, user);
    return c.json({ success: true, ...result });
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 400;
    return c.json({ success: false, message: error.message }, status);
  }
});

// POST /api/tasks/:id/attachments
taskRoutes.post("/:id/attachments", async (c) => {
  const user = c.get("user");
  const taskId = c.req.param("id");
  const body = await c.req.json();
  const validated = createAttachmentSchema.parse(body);

  try {
    const attachment = await TaskService.addAttachment(taskId, validated, user);
    return c.json({ success: true, message: "Attachment added successfully", data: attachment }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
});
