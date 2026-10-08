import { Router } from "express";
import { listServices } from "../services/services.service";

const services = Router();

services.get("/", (_req, res) => {
  return res.json(listServices());
});

export default services;
export { services };
