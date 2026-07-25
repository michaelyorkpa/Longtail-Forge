import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { getPrivateFeedProvider } from "../core/private-feeds/private-feed-providers.js";
import { privateFeedTokensRepository } from "../repositories/private-feed-tokens.repo.js";
import { securityEventsService } from "../security/security-events.js";
import { AppError } from "../utils/app-error.js";
import { normalizeTimezone } from "../utils/normalizers.js";

const PRIVATE_CALENDAR_PROVIDER_ID = "tasks.calendar";
const RAW_TOKEN_PREFIX = "ltf_feed";
const DUMMY_TOKEN_HASH = createHash("sha256").update("longtail-forge-private-feed-dummy").digest();

async function getCalendarStatus(session) {
  const token = await privateFeedTokensRepository.readForUser(
    session.workspace_id,
    session.user_id,
    PRIVATE_CALENDAR_PROVIDER_ID,
  );
  return toPublicStatus(token);
}

async function generateCalendar(session, requestOrigin) {
  return activateCalendar(session, requestOrigin, {
    allowActiveReplace: false,
    eventType: "security.private_feed.generated",
    operation: "generate",
  });
}

async function rotateCalendar(session, requestOrigin) {
  return activateCalendar(session, requestOrigin, {
    allowActiveReplace: true,
    eventType: "security.private_feed.rotated",
    operation: "rotate",
  });
}

async function activateCalendar(session, requestOrigin, options) {
  const rawToken = createRawToken();
  const parsedToken = parseRawToken(rawToken);
  const result = await privateFeedTokensRepository.activate({
    allowActiveReplace: options.allowActiveReplace,
    providerId: PRIVATE_CALENDAR_PROVIDER_ID,
    tokenHash: hashTokenSecret(parsedToken.secret).toString("hex"),
    tokenSelector: parsedToken.selector,
    userId: session.user_id,
    workspaceId: session.workspace_id,
  });

  if (!result.changed) {
    const message = result.reason === "already_active"
      ? "The private calendar feed is already enabled. Rotate it to issue a new URL."
      : "The private calendar feed is not enabled.";
    throw new AppError(message, 409);
  }

  await recordLifecycleSecurityEvent(session, options.eventType, options.operation);
  return {
    feedUrl: buildFeedUrl(rawToken, requestOrigin),
    status: toPublicStatus(result.token),
  };
}

async function disableCalendar(session) {
  const result = await privateFeedTokensRepository.disable(
    session.workspace_id,
    session.user_id,
    PRIVATE_CALENDAR_PROVIDER_ID,
  );
  if (result.changed) {
    await recordLifecycleSecurityEvent(
      session,
      "security.private_feed.disabled",
      "disable",
    );
  }

  return {
    status: toPublicStatus(result.token),
  };
}

async function renderCalendar(rawToken) {
  const identity = await authenticateToken(rawToken, PRIVATE_CALENDAR_PROVIDER_ID);
  if (!identity) {
    return null;
  }

  const provider = getPrivateFeedProvider(PRIVATE_CALENDAR_PROVIDER_ID);
  if (!provider) {
    throw new Error("The Tasks private calendar feed provider is not registered.");
  }

  const content = await provider.render(Object.freeze({
    providerId: PRIVATE_CALENDAR_PROVIDER_ID,
    session: identity,
  }));
  if (content === null) {
    return null;
  }
  if (typeof content !== "string") {
    throw new TypeError(`Private feed provider "${provider.id}" must return a string or null.`);
  }

  return content;
}

async function authenticateToken(rawToken, providerId) {
  const parsedToken = parseRawToken(rawToken);
  const row = await privateFeedTokensRepository.readForAuthentication(
    providerId,
    parsedToken.selector,
  );
  const candidateHash = hashTokenSecret(parsedToken.secret);
  const storedHash = readStoredHash(row?.token_hash);
  const hashMatches = timingSafeEqual(candidateHash, storedHash);

  if (!row || row.status !== "active" || !parsedToken.valid || !hashMatches) {
    return null;
  }

  return {
    active_workspace_id: row.workspace_id,
    home_workspace_id: row.home_workspace_id,
    ip_address: "",
    session_mode: "private_feed",
    timezone: normalizeTimezone(row.timezone),
    user_id: row.user_id,
    username: row.username,
    workspace_id: row.workspace_id,
    workspace_type: row.workspace_type,
  };
}

function createRawToken() {
  const selector = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return `${RAW_TOKEN_PREFIX}_${selector}_${secret}`;
}

function parseRawToken(value) {
  const token = String(value || "");
  const match = /^ltf_feed_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/.exec(token);
  return {
    secret: match?.[2] || "invalid-private-feed-secret",
    selector: match?.[1] || "invalid-selector",
    valid: Boolean(match),
  };
}

function hashTokenSecret(secret) {
  return createHash("sha256").update(String(secret || "")).digest();
}

function readStoredHash(value) {
  const hash = /^[a-f0-9]{64}$/i.test(String(value || ""))
    ? Buffer.from(value, "hex")
    : DUMMY_TOKEN_HASH;
  return hash.length === DUMMY_TOKEN_HASH.length ? hash : DUMMY_TOKEN_HASH;
}

function buildFeedUrl(rawToken, requestOrigin) {
  const baseUrl = String(config.publicUrl || requestOrigin || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new AppError("The private calendar feed URL could not be resolved.", 500);
  }
  return `${baseUrl}/feeds/calendar/${encodeURIComponent(rawToken)}.ics`;
}

function toPublicStatus(token) {
  return {
    createdAt: token?.created_at || null,
    disabledAt: token?.disabled_at || null,
    enabled: token?.status === "active",
    rotatedAt: token?.rotated_at || null,
  };
}

async function recordLifecycleSecurityEvent(session, eventType, operation) {
  await securityEventsService.record({
    eventType,
    outcome: "success",
    reasonClass: `private_feed_${operation}`,
    metadata: {
      operation,
      resource_type: "private_calendar_feed",
    },
    session,
  });
}

export const privateFeedsService = {
  disableCalendar,
  generateCalendar,
  getCalendarStatus,
  renderCalendar,
  rotateCalendar,
};

export { PRIVATE_CALENDAR_PROVIDER_ID };
