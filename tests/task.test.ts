import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../src/lib/prisma";
import { TaskService } from "../src/modules/tasks/task.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { TaskStatus, Role, Department } from "@prisma/client";

describe("Task Business Logic & Security Enforcements", () => {
  let pmUser: any;
  let feUser: any;
  let clientUser: any;
  let project: any;
  let taskA: any;
  let taskC: any;

  beforeAll(async () => {
    // Authenticate users
    const pmAuth = await AuthService.login({ email: "pm@nodewave.id", password: "password123" });
    pmUser = pmAuth.user;

    const feAuth = await AuthService.login({ email: "fe@nodewave.id", password: "password123" });
    feUser = feAuth.user;

    const clientAuth = await AuthService.login({ email: "client@nodewave.id", password: "password123" });
    clientUser = clientAuth.user;

    project = await prisma.project.findFirst({ where: { deletedAt: null } });

    const tasks = await prisma.task.findMany({
      where: { projectId: project.id, deletedAt: null },
      include: { prerequisites: true },
    });

    taskA = tasks.find((t) => t.title.includes("UI/UX") || t.department === Department.UIUX);
    taskC = tasks.find((t) => t.prerequisites.length > 0 || t.status === TaskStatus.BLOCKED);
  });

  test("1. Should reject starting Task C when prerequisite dependencies are not done", async () => {
    expect(taskC).toBeDefined();

    let errorThrown: any = null;
    try {
      await TaskService.updateTask(
        taskC.id,
        {
          version: taskC.version,
          status: TaskStatus.IN_PROGRESS,
        },
        feUser
      );
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.status).toBe(422);
    expect(errorThrown.message).toContain("Prerequisite task");
  });

  test("2. Should reject update with 409 Conflict when optimistic locking version mismatches", async () => {
    let errorThrown: any = null;
    try {
      await TaskService.updateTask(
        taskC.id,
        {
          version: taskC.version + 999, // Intentional outdated version token
          description: "Attempted conflicting concurrent write",
        },
        pmUser
      );
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.status).toBe(409);
    expect(errorThrown.message).toContain("Conflict detected");
  });

  test("3. Should forbid Product Manager from directly completing in-progress task to DONE", async () => {
    expect(taskA).toBeDefined();

    let errorThrown: any = null;
    try {
      await TaskService.updateTask(
        taskA.id,
        {
          version: taskA.version,
          status: TaskStatus.DONE,
        },
        pmUser
      );
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.message).toContain("Product Managers cannot move a task from In Progress to Done");
  });

  test("4. Should apply tenant data masking for Client Guest role", async () => {
    const clientTasks = await TaskService.listTasks(project.id, {}, clientUser);

    expect(clientTasks.length).toBeGreaterThan(0);
    for (const t of clientTasks) {
      // Must not expose engineer identity
      expect(t.assignee).toBeNull();
      // Department identity must be masked
      expect(t.department).toBe("INTERNAL");
      // Prerequisite internal graph and attachments must be sanitized
      expect(t.prerequisites).toEqual([]);
      expect(t.attachments).toEqual([]);
      // Only client-visible tasks must be fetched
      expect(t.isClientVisible).toBe(true);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
