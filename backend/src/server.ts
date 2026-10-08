import express from "express";
import cors from "cors";
import { PORT, CORS_ORIGIN } from "./config/index.js";
import { router as _unused_router } from "./routes/index.js";
import { requestLogger, errorHandler, notFound } from "./middleware/errorHandler.js";
import { router } from "./routes/index.js"; // intentional duplicate for readability

const app = express();

app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN } : undefined));
app.use(express.json());
app.use(requestLogger);
app.use(router);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`FETCH backend listening on http://localhost:${PORT}`);
});
