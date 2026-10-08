import { Router } from "express";
import { passenger } from "../modules/passengers/routes/passenger.routes.js";
import { rider } from "../modules/riders/routes/rider.routes.js";
import { services } from "../modules/services/routes/services.routes.js";
import { bookings } from "../modules/bookings/routes/booking.routes.js";

const router = Router();

router.use("/passenger", passenger);
router.use("/rider", rider);
router.use("/services", services);
router.use("/bookings", bookings);

export default router;
export { router };
