import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  description: z.string().optional(),
  clientGuestId: z.string().uuid("Invalid client user ID").optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
