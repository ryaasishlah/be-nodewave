import { Hono } from "hono";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { Role, TaskStatus, Department } from "@prisma/client";

export const standupRoutes = new Hono();

standupRoutes.use("*", authMiddleware);

// GET /api/standup-summary/:projectId
standupRoutes.get("/:projectId", async (c) => {
  const user = c.get("user");
  const projectId = c.req.param("projectId");

  if (user.role === Role.CLIENT_GUEST) {
    return c.json({ success: false, message: "Forbidden: Client Guest cannot view internal standup summary" }, 403);
  }

  // Fetch done status transitions from the last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const completedYesterdayLogs = await prisma.auditLog.findMany({
    where: {
      projectId,
      action: "STATUS_CHANGE",
      changedColumn: "status",
      newValue: TaskStatus.DONE,
      timestamp: { gte: yesterday },
    },
    include: {
      task: true,
      user: { select: { id: true, name: true, department: true } },
    },
  });

  // Fetch currently blocked tasks
  const currentBlockedTasks = await prisma.task.findMany({
    where: {
      projectId,
      deletedAt: null,
      status: TaskStatus.BLOCKED,
    },
    include: {
      assignee: { select: { id: true, name: true, department: true } },
      prerequisites: {
        include: {
          prerequisiteTask: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });

  // Aggregate deliverables and blockers per department
  const departments = [Department.UIUX, Department.FRONTEND, Department.BACKEND, Department.PRODUCT_MANAGEMENT];

  const summary: Record<string, { completedYesterday: any[]; blockedToday: any[] }> = {};

  for (const dept of departments) {
    summary[dept] = {
      completedYesterday: completedYesterdayLogs
        .filter((l) => l.task?.department === dept)
        .map((l) => ({
          taskId: l.taskId,
          title: l.task?.title,
          completedBy: l.user.name,
          timestamp: l.timestamp,
        })),
      blockedToday: currentBlockedTasks
        .filter((t) => t.department === dept)
        .map((t) => ({
          taskId: t.id,
          title: t.title,
          assignee: t.assignee?.name || "Unassigned",
          waitingOn: t.prerequisites.map((p) => ({
            title: p.prerequisiteTask.title,
            status: p.prerequisiteTask.status,
          })),
        })),
    };
  }

  return c.json({
    success: true,
    data: {
      projectId,
      generatedAt: new Date().toISOString(),
      summary,
    },
  });
});
