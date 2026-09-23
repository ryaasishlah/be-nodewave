import { z } from "zod";
import { Department, TaskStatus } from "@prisma/client";

export const createTaskSchema = z.object({
  projectId: z.string().uuid("Invalid project ID"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  department: z.nativeEnum(Department),
  assigneeId: z.string().uuid("Invalid assignee ID").optional(),
  isClientVisible: z.boolean().optional().default(false),
  prerequisiteIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateTaskSchema = z.object({
  version: z.number(),
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  department: z.nativeEnum(Department).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  isClientVisible: z.boolean().optional(),
  prerequisiteIds: z.array(z.string().uuid()).optional(),
});

export const createAttachmentSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileUrl: z.string().url("File URL must be a valid URL"),
  fileSize: z.number().int().positive("File size must be positive"),
  fileType: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
