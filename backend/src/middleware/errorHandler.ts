import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err instanceof Error && "status" in err) ? (err as any).status : 500;
  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export const requestLogger = (_req: Request, _res: Response, next: NextFunction) => next();
