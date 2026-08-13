// @ts-check

import { AppError } from "../utils/app-error.js";
import { isPublicDemoVisitorIdentity } from "./public-demo-runtime.js";

const PUBLIC_DEMO_IDENTITY_DENIAL_CODE = "public_demo_identity_immutable";
const PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE = "This public demo account cannot be changed.";

/**
 * @param {string} userId
 */
function assertPublicDemoVisitorIdentityMutable(userId) {
  if (isPublicDemoVisitorIdentity(userId)) {
    throw new AppError(PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE, 403, {
      code: PUBLIC_DEMO_IDENTITY_DENIAL_CODE,
    });
  }
}

export {
  PUBLIC_DEMO_IDENTITY_DENIAL_CODE,
  PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE,
  assertPublicDemoVisitorIdentityMutable,
};