import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { Role, Department } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: Department;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

const JWT_SECRET: string = process.env.JWT_SECRET || "nodewave_super_secret_jwt_key_2026";

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        message: "Unauthorized: Missing or invalid token format",
      },
      401
    );
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return c.json(
      {
        success: false,
        message: "Unauthorized: Missing token",
      },
      401
    );
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as AuthUser;
    c.set("user", decoded);
    await next();
  } catch (error) {
    return c.json(
      {
        success: false,
        message: "Unauthorized: Token expired or invalid",
      },
      401
    );
  }
});
