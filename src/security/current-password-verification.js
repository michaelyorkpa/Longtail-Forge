import { usersRepository } from "../repositories/users.repo.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "./auth-throttle.js";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./passwords.js";
import { AppError } from "../utils/app-error.js";

async function verifyCurrentPasswordForSensitiveAction(session, password, context = {}) {
  const currentPassword = String(password || "");
  if (!currentPassword) {
    throw new AppError("Current password is required.", 400);
  }

  const user = await usersRepository.readFirstByUserId(session?.actor_user_id || session?.user_id);
  const throttleContext = {
    actorUserId: session?.actor_user_id || session?.user_id,
    ipAddress: context.ipAddress || session?.ip_address,
    scope: context.scope || "current-password",
    username: session?.actor_username || session?.username || user?.username,
    workspaceId: session?.workspace_id,
  };
  const attempt = await authenticationThrottle.runWithVerificationAdmission(
    throttleContext,
    () => verifyPassword(currentPassword, user?.password || DUMMY_PASSWORD_HASH),
  );

  if (attempt.blocked) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  if (!user || user.user_status !== "active" || !attempt.value?.matches) {
    const failure = await authenticationThrottle.recordSensitiveAction(throttleContext);
    await emitAuthenticationThrottleLockout(throttleContext, failure);
    if (failure.blocked) {
      throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
    }
    throw new AppError("Current password is incorrect.", 400);
  }

  await authenticationThrottle.reset(throttleContext);
  return user;
}

export { verifyCurrentPasswordForSensitiveAction };
