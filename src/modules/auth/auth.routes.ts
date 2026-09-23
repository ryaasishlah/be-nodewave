import { Hono } from "hono";
import { AuthService } from "./auth.service";
import { loginSchema, registerSchema } from "./auth.dto";
import { authMiddleware } from "../../middlewares/auth.middleware";

export const authRoutes = new Hono();

// POST /api/auth/login
authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const validated = loginSchema.parse(body);

  const result = await AuthService.login(validated);

  return c.json({
    success: true,
    message: "Login successful",
    data: result,
  });
});

// POST /api/auth/register
authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const validated = registerSchema.parse(body);

  const result = await AuthService.register(validated);

  return c.json(
    {
      success: true,
      message: "Registration successful",
      data: result,
    },
    201
  );
});

// GET /api/auth/me (Protected)
authRoutes.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const profile = await AuthService.getMe(user.id);

  return c.json({
    success: true,
    data: profile,
  });
});
