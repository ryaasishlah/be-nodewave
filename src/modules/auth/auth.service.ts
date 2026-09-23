import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import type { LoginInput, RegisterInput } from "./auth.dto";
import type { AuthUser } from "../../middlewares/auth.middleware";

const JWT_SECRET: string = process.env.JWT_SECRET || "nodewave_super_secret_jwt_key_2026";

export class AuthService {
  static async login(data: LoginInput) {
    const user = await prisma.user.findFirst({
      where: {
        email: data.email,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }

    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return {
      user: payload,
      token,
    };
  }

  static async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new Error("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role,
        department: data.department,
      },
    });

    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return {
      user: payload,
      token,
    };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }
}
