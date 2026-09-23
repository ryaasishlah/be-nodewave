import { PrismaClient, Role, Department, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seeding...");

  // Clear existing records
  await prisma.auditLog.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const defaultPassword = await bcrypt.hash("password123", 10);

  // 1. Seed Users across Roles and Departments
  const pmUser = await prisma.user.create({
    data: {
      email: "pm@nodewave.id",
      name: "Alex Pratama (PM)",
      password: defaultPassword,
      role: Role.PRODUCT_MANAGER,
      department: Department.PRODUCT_MANAGEMENT,
    },
  });

  const uiuxUser = await prisma.user.create({
    data: {
      email: "uiux@nodewave.id",
      name: "Sarah Amanda (UI/UX)",
      password: defaultPassword,
      role: Role.INTERNAL_TEAM,
      department: Department.UIUX,
    },
  });

  const feUser = await prisma.user.create({
    data: {
      email: "fe@nodewave.id",
      name: "Rian Hidayat (Frontend)",
      password: defaultPassword,
      role: Role.INTERNAL_TEAM,
      department: Department.FRONTEND,
    },
  });

  const beUser = await prisma.user.create({
    data: {
      email: "be@nodewave.id",
      name: "Budi Santoso (Backend)",
      password: defaultPassword,
      role: Role.INTERNAL_TEAM,
      department: Department.BACKEND,
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: "client@nodewave.id",
      name: "PT Mitra Solusi (Client)",
      password: defaultPassword,
      role: Role.CLIENT_GUEST,
      department: Department.CLIENT,
    },
  });

  console.log("Created 5 seed user accounts (default password: password123)");

  // 2. Seed Primary Project
  const project = await prisma.project.create({
    data: {
      name: "Enterprise Deliverable Management System",
      description: "Platform deliverable operasional internal NodeWave dan monitoring progress client.",
      clientGuestId: clientUser.id,
      members: {
        create: [
          { userId: pmUser.id },
          { userId: uiuxUser.id },
          { userId: feUser.id },
          { userId: beUser.id },
        ],
      },
    },
  });

  console.log(`Created project: ${project.name}`);

  // 3. Seed Tasks
  const taskA = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "UI/UX: High-Fidelity Design System",
      description: "Menyusun token warna brand NodeWave, komponen Radix UI, dan alur interaktif task board.",
      department: Department.UIUX,
      status: TaskStatus.IN_PROGRESS,
      assigneeId: uiuxUser.id,
      isClientVisible: true,
      version: 1,
    },
  });

  const taskB = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "Backend: RBAC & Dependency Engine API",
      description: "Implementasi endpoint task state transition, optimistic locking (409 Conflict), dan Prisma EZFilter.",
      department: Department.BACKEND,
      status: TaskStatus.TODO,
      assigneeId: beUser.id,
      isClientVisible: false,
      version: 1,
    },
  });

  const taskC = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "Frontend: Dependency-Aware Kanban Board",
      description: "Slicing board Next.js, integrasi state-based button locking, dan modal detail audit log.",
      department: Department.FRONTEND,
      status: TaskStatus.BLOCKED,
      assigneeId: feUser.id,
      isClientVisible: false,
      version: 1,
    },
  });

  const taskD = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "Executive Deliverable Milestone Review",
      description: "Ringkasan metrik performa sprint minggu pertama untuk evaluasi stakeholder client.",
      department: Department.PRODUCT_MANAGEMENT,
      status: TaskStatus.IN_PROGRESS,
      assigneeId: pmUser.id,
      isClientVisible: true,
      version: 1,
    },
  });

  // 4. Create Task Dependencies (Task C depends on Task A and Task B)
  await prisma.taskDependency.createMany({
    data: [
      {
        taskId: taskC.id,
        prerequisiteTaskId: taskA.id,
      },
      {
        taskId: taskC.id,
        prerequisiteTaskId: taskB.id,
      },
    ],
  });

  console.log("Task dependencies configured: Task C blocked by Task A and Task B");

  // 5. Initial Audit Log Entry
  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      taskId: taskA.id,
      userId: pmUser.id,
      action: "CREATE",
      entityType: "TASK",
      entityId: taskA.id,
      changedColumn: "status",
      oldValue: null,
      newValue: "IN_PROGRESS",
    },
  });

  console.log("Database seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during database seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
