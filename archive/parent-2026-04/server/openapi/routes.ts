/**
 * @file routes.ts
 * @description OpenAPI/Swagger UI routes
 */

import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./spec";

const router = Router();

// Serve OpenAPI spec as JSON
router.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

// Serve Swagger UI
router.use("/", swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "RSES CMS API Documentation",
}));

export default router;
