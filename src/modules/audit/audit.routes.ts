import { Hono } from "hono";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { Role } from "@prisma/client";

export const auditRoutes = new Hono();

auditRoutes.use("*", authMiddleware);

// GET /api/audit-logs?projectId=...&taskId=...
auditRoutes.get("/", async (c) => {
  const user = c.get("user");
  const projectId = c.req.query("projectId");
  const taskId = c.req.query("taskId");

  // Restrict client guests from viewing internal audit history
  if (user.role === Role.CLIENT_GUEST) {
    return c.json({ success: false, message: "Forbidden: Client Guest cannot view internal audit trail" }, 403);
  }

  if (!projectId) {
    return c.json({ success: false, message: "Query parameter 'projectId' is required" }, 400);
  }

  const whereClause: any = { projectId };
  if (taskId) whereClause.taskId = taskId;

  const logs = await prisma.auditLog.findMany({
    where: whereClause,
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          avatarUrl: true,
        },
      },
      task: {
        select: {
          id: true,
          title: true,
          department: true,
        },
      },
    },
  });

  return c.json({
    success: true,
    data: logs,
  });
});
