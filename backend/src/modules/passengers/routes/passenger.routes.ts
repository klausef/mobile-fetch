import { Router } from "express";
import { getPassenger } from "../services/passenger.service";

const passenger = Router();

passenger.get("/:id", (req, res) => {
  const passenger = getPassenger(req.params.id);
  if (!passenger) return res.status(404).json({ error: "Passenger not found" });
  return res.json(passenger);
});

export default passenger;
export { passenger };
