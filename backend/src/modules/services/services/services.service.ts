import { db } from "../../database/db";
import { type Service } from "../types";

export function listServices() {
  return db.getServices();
}

export function getService(id: string): Service | undefined {
  return db.getServices().find((s) => s.id === id);
}
