import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { generateSpec } from "../swagger.js";

const router = Router();

const spec = generateSpec();

router.use(swaggerUi.serve);
router.get("/", swaggerUi.setup(spec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "KEYCODE Studio API Docs"
}));

router.get("/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(spec);
});

export default router;
