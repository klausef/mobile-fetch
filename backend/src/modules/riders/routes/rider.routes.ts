import { Router } from "express";
import { getRider } from "../services/rider.service";

const rider = Router();

rider.get("/:id", (req, res) => {
  const r = getRider(req.params.id);
  if (!r) return res.status(404).json({ error: "Rider not found" });
  return res.json(r);
});

export default rider;
export { rider };
