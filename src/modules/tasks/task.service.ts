import { prisma } from "../../lib/prisma";
import type { AuthUser } from "../../middlewares/auth.middleware";
import type { CreateTaskInput, UpdateTaskInput, CreateAttachmentInput } from "./task.dto";
import { Role, TaskStatus } from "@prisma/client";
import { BuildQueryFilter } from "@nodewave/prisma-ezfilter";

export class TaskService {
  static async listTasks(projectId: string, queryParams: any, user: AuthUser) {
    // Verify project access permissions
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { members: true },
    });

    if (!project) throw new Error("Project not found");

    if (user.role === Role.CLIENT_GUEST && project.clientGuestId !== user.id) {
      throw new Error("Forbidden: You do not have access to this project");
    }

    if (user.role === Role.INTERNAL_TEAM) {
      const isMember = project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new Error("Forbidden: You are not assigned to this project");
    }

    // Dynamic query building via @nodewave/prisma-ezfilter
    const queryBuilder = new BuildQueryFilter();
    const filterInput = {
      filters: queryParams.filters ? JSON.parse(queryParams.filters) : undefined,
      searchFilters: queryParams.searchFilters ? JSON.parse(queryParams.searchFilters) : undefined,
      rangedFilters: queryParams.rangedFilters ? JSON.parse(queryParams.rangedFilters) : undefined,
      orderKey: queryParams.orderKey || "createdAt",
      orderRule: (queryParams.orderRule as "asc" | "desc") || "desc",
      page: queryParams.page ? parseInt(queryParams.page, 10) : 1,
      rows: queryParams.rows ? parseInt(queryParams.rows, 10) : 50,
    };

    const builtQuery = queryBuilder.build(filterInput);

    // Mandatory scope: project ID and non-deleted records
    const baseWhere: any = {
      projectId,
      deletedAt: null,
      ...builtQuery.query.where,
    };

    // Enforce visibility filter for client guest tenant
    if (user.role === Role.CLIENT_GUEST) {
      baseWhere.isClientVisible = true;
    }

    const tasks = await prisma.task.findMany({
      where: baseWhere,
      orderBy: builtQuery.query.orderBy,
      take: builtQuery.query.take,
      skip: builtQuery.query.skip,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            avatarUrl: true,
          },
        },
        prerequisites: {
          include: {
            prerequisiteTask: {
              select: {
                id: true,
                title: true,
                status: true,
                department: true,
              },
            },
          },
        },
        attachments: {
          where: { deletedAt: null },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            fileType: true,
            createdAt: true,
          },
        },
      },
    });

    // Dependency evaluation and client data masking
    return tasks.map((task) => {
      // Check whether task has unmet prerequisites
      const hasUnfinishedPrerequisites = task.prerequisites.some(
        (p) => p.prerequisiteTask.status !== TaskStatus.DONE
      );

      const dynamicStatus =
        task.status === TaskStatus.TODO && hasUnfinishedPrerequisites
          ? TaskStatus.BLOCKED
          : task.status;

      // Apply tenant data masking for client guest view
      if (user.role === Role.CLIENT_GUEST) {
        return {
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          description: task.description,
          status: dynamicStatus,
          isClientVisible: true,
          assignee: null,
          department: "INTERNAL",
          version: task.version,
          prerequisites: [],
          attachments: [],
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        };
      }

      return {
        ...task,
        status: dynamicStatus,
        isBlocked: hasUnfinishedPrerequisites,
      };
    });
  }

  static async getTaskById(taskId: string, user: AuthUser) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        project: { include: { members: true } },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            avatarUrl: true,
          },
        },
        prerequisites: {
          include: {
            prerequisiteTask: {
              select: {
                id: true,
                title: true,
                status: true,
                department: true,
              },
            },
          },
        },
        attachments: { where: { deletedAt: null } },
        auditLogs: {
          orderBy: { timestamp: "desc" },
          take: 20,
          include: {
            user: { select: { id: true, name: true, role: true, department: true } },
          },
        },
      },
    });

    if (!task) throw new Error("Task not found");

    if (user.role === Role.CLIENT_GUEST) {
      if (!task.isClientVisible || task.project.clientGuestId !== user.id) {
        throw new Error("Forbidden: You do not have access to this task");
      }

      // Apply tenant data masking
      return {
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: task.status,
        isClientVisible: true,
        assignee: null,
        department: "INTERNAL",
        version: task.version,
        attachments: [],
        auditLogs: [],
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    }

    return task;
  }

  static async createTask(data: CreateTaskInput, user: AuthUser) {
    if (user.role !== Role.PRODUCT_MANAGER) {
      throw new Error("Forbidden: Only Product Managers can create tasks");
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          description: data.description,
          department: data.department,
          assigneeId: data.assigneeId,
          isClientVisible: data.isClientVisible ?? false,
          version: 1,
        },
      });

      // Attach prerequisite task dependencies
      if (data.prerequisiteIds && data.prerequisiteIds.length > 0) {
        await tx.taskDependency.createMany({
          data: data.prerequisiteIds.map((prereqId) => ({
            taskId: created.id,
            prerequisiteTaskId: prereqId,
          })),
        });
      }

      // Record immutable audit trail
      await tx.auditLog.create({
        data: {
          projectId: data.projectId,
          taskId: created.id,
          userId: user.id,
          action: "CREATE",
          entityType: "TASK",
          entityId: created.id,
          changedColumn: "status",
          oldValue: null,
          newValue: TaskStatus.TODO,
        },
      });

      return created;
    });

    return task;
  }

  static async updateTask(taskId: string, data: UpdateTaskInput, user: AuthUser) {
    const currentTask = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        prerequisites: {
          include: { prerequisiteTask: true },
        },
      },
    });

    if (!currentTask) throw new Error("Task not found");

    // Optimistic locking check to prevent concurrency race conditions
    if (currentTask.version !== data.version) {
      const conflictError: any = new Error(
        `Conflict detected: This task was modified by another user. Current version is ${currentTask.version}, but you submitted version ${data.version}. Please refresh to get latest state.`
      );
      conflictError.status = 409;
      throw conflictError;
    }

    // Role and state-based access control restrictions
    // Restrict internal engineers from altering task title or description
    if (user.role === Role.INTERNAL_TEAM) {
      if (data.title !== undefined || data.description !== undefined) {
        throw new Error(
          "Forbidden: Internal team members can only update status and attachments, not task details."
        );
      }
    }

    // Prevent PMs from directly marking in-progress tasks as done
    if (
      user.role === Role.PRODUCT_MANAGER &&
      currentTask.status === TaskStatus.IN_PROGRESS &&
      data.status === TaskStatus.DONE
    ) {
      throw new Error(
        "Forbidden: Product Managers cannot move a task from In Progress to Done. Only the assigned executor can complete it."
      );
    }

    // Inter-task dependency validation
    // Require all prerequisites to be completed before moving to in-progress
    if (data.status === TaskStatus.IN_PROGRESS) {
      const unfinishedPrerequisite = currentTask.prerequisites.find(
        (p) => p.prerequisiteTask.status !== TaskStatus.DONE
      );

      if (unfinishedPrerequisite) {
        const error: any = new Error(
          `Cannot start task: Prerequisite task "${unfinishedPrerequisite.prerequisiteTask.title}" is still ${unfinishedPrerequisite.prerequisiteTask.status}. All prerequisites must be completed first.`
        );
        error.status = 422;
        throw error;
      }
    }

    // Execute atomic update and persist immutable audit trail
    const updated = await prisma.$transaction(async (tx) => {
      const auditEntries: any[] = [];

      // Record field-level diffs
      if (data.status && data.status !== currentTask.status) {
        auditEntries.push({
          projectId: currentTask.projectId,
          taskId: currentTask.id,
          userId: user.id,
          action: "STATUS_CHANGE",
          entityType: "TASK",
          entityId: currentTask.id,
          changedColumn: "status",
          oldValue: currentTask.status,
          newValue: data.status,
        });
      }

      if (data.title && data.title !== currentTask.title) {
        auditEntries.push({
          projectId: currentTask.projectId,
          taskId: currentTask.id,
          userId: user.id,
          action: "UPDATE",
          entityType: "TASK",
          entityId: currentTask.id,
          changedColumn: "title",
          oldValue: currentTask.title,
          newValue: data.title,
        });
      }

      if (data.description && data.description !== currentTask.description) {
        auditEntries.push({
          projectId: currentTask.projectId,
          taskId: currentTask.id,
          userId: user.id,
          action: "UPDATE",
          entityType: "TASK",
          entityId: currentTask.id,
          changedColumn: "description",
          oldValue: currentTask.description,
          newValue: data.description,
        });
      }

      if (data.assigneeId !== undefined && data.assigneeId !== currentTask.assigneeId) {
        auditEntries.push({
          projectId: currentTask.projectId,
          taskId: currentTask.id,
          userId: user.id,
          action: "UPDATE",
          entityType: "TASK",
          entityId: currentTask.id,
          changedColumn: "assigneeId",
          oldValue: currentTask.assigneeId,
          newValue: data.assigneeId,
        });
      }

      if (auditEntries.length > 0) {
        await tx.auditLog.createMany({ data: auditEntries });
      }

      // Increment task version for optimistic locking
      const res = await tx.task.update({
        where: { id: taskId },
        data: {
          title: data.title,
          description: data.description,
          department: data.department,
          status: data.status,
          assigneeId: data.assigneeId,
          isClientVisible: data.isClientVisible,
          version: { increment: 1 },
        },
      });

      return res;
    });

    return updated;
  }

  static async deleteTask(taskId: string, user: AuthUser) {
    if (user.role !== Role.PRODUCT_MANAGER) {
      throw new Error("Forbidden: Only Product Managers can delete tasks");
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) throw new Error("Task not found");

    // Soft delete record with timestamp audit entry
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          userId: user.id,
          action: "SOFT_DELETE",
          entityType: "TASK",
          entityId: task.id,
          changedColumn: "deletedAt",
          oldValue: null,
          newValue: new Date().toISOString(),
        },
      });
    });

    return { message: "Task soft-deleted successfully" };
  }

  static async addAttachment(taskId: string, data: CreateAttachmentInput, user: AuthUser) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) throw new Error("Task not found");

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        uploadedById: user.id,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        fileType: data.fileType,
      },
    });

    await prisma.auditLog.create({
      data: {
        projectId: task.projectId,
        taskId: task.id,
        userId: user.id,
        action: "UPDATE",
        entityType: "TASK",
        entityId: task.id,
        changedColumn: "attachment",
        oldValue: null,
        newValue: data.fileName,
      },
    });

    return attachment;
  }
}
