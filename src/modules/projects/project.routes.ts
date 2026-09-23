import { Hono } from "hono";
import { ProjectService } from "./project.service";
import { createProjectSchema } from "./project.dto";
import { authMiddleware } from "../../middlewares/auth.middleware";

export const projectRoutes = new Hono();

projectRoutes.use("*", authMiddleware);

// GET /api/projects
projectRoutes.get("/", async (c) => {
  const user = c.get("user");
  const projects = await ProjectService.listProjects(user);

  return c.json({
    success: true,
    data: projects,
  });
});

// GET /api/projects/:id
projectRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("id");

  try {
    const project = await ProjectService.getProjectById(projectId, user);
    return c.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 404;
    return c.json(
      {
        success: false,
        message: error.message,
      },
      status
    );
  }
});

// POST /api/projects (PM only)
projectRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const validated = createProjectSchema.parse(body);

  try {
    const project = await ProjectService.createProject(validated, user);
    return c.json(
      {
        success: true,
        message: "Project created successfully",
        data: project,
      },
      201
    );
  } catch (error: any) {
    const status = error.message.includes("Forbidden") ? 403 : 400;
    return c.json(
      {
        success: false,
        message: error.message,
      },
      status
    );
  }
});
