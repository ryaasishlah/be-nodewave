import { prisma } from "../../lib/prisma";
import type { AuthUser } from "../../middlewares/auth.middleware";
import type { CreateProjectInput } from "./project.dto";
import { Role, TaskStatus } from "@prisma/client";

export class ProjectService {
  static async listProjects(user: AuthUser) {
    const whereClause: any = { deletedAt: null };

    if (user.role === Role.CLIENT_GUEST) {
      // Tenant isolation: Client guest can only access own project
      whereClause.clientGuestId = user.id;
    } else if (user.role === Role.INTERNAL_TEAM) {
      // Internal team can only access assigned projects
      whereClause.members = {
        some: { userId: user.id },
      };
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
            members: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return projects;
  }

  static async getProjectById(projectId: string, user: AuthUser) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        members: {
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
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Multi-tenant authorization check
    if (user.role === Role.CLIENT_GUEST && project.clientGuestId !== user.id) {
      throw new Error("Forbidden: You do not have access to this project");
    }

    if (user.role === Role.INTERNAL_TEAM) {
      const isMember = project.members.some((m) => m.userId === user.id);
      if (!isMember) {
        throw new Error("Forbidden: You are not assigned to this project");
      }
    }

    // Aggregate progress metrics computation
    const taskCondition: any = {
      projectId: project.id,
      deletedAt: null,
    };

    if (user.role === Role.CLIENT_GUEST) {
      taskCondition.isClientVisible = true;
    }

    const totalTasks = await prisma.task.count({ where: taskCondition });
    const completedTasks = await prisma.task.count({
      where: {
        ...taskCondition,
        status: TaskStatus.DONE,
      },
    });

    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Tenant data masking: omit internal project members
    const sanitizedMembers =
      user.role === Role.CLIENT_GUEST ? [] : project.members;

    return {
      ...project,
      members: sanitizedMembers,
      metrics: {
        totalTasks,
        completedTasks,
        progressPercentage,
      },
    };
  }

  static async createProject(data: CreateProjectInput, user: AuthUser) {
    // Access control: restricted to Product Managers
    if (user.role !== Role.PRODUCT_MANAGER) {
      throw new Error("Forbidden: Only Product Managers can create projects");
    }

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        clientGuestId: data.clientGuestId,
        members: {
          create: [{ userId: user.id }],
        },
      },
    });

    return project;
  }
}
