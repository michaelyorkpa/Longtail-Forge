import { Router } from "express";
import { accountExportRecoveryService } from "../services/account-export-recovery.service.js";
import { authenticatedAsyncRoute as asyncRoute } from "../utils/http.js";

const accountExportRecoveryRoutes = Router();

accountExportRecoveryRoutes.get("/user/portable-account-export", asyncRoute(async (request, response) => {
  const payload = await accountExportRecoveryService.exportPortableAccount(request.session);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Disposition", 'attachment; filename="longtail-forge-account-data.json"');
  response.status(200).json(payload);
}));

export { accountExportRecoveryRoutes };
