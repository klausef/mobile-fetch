import type { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.originalUrl} ${req.ip}`);
  next();
}
