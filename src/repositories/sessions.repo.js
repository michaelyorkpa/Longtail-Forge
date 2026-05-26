import { querySql, runSql, sqlText } from "../db/index.js";

async function create(session) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  organization_id,
  user_id,
  username,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(session.session_id)},
  ${sqlText(session.organization_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.username)},
  ${sqlText(session.expires_at)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function readById(sessionId) {
  const rows = await querySql(`
SELECT
  session_id,
  organization_id,
  user_id,
  username,
  expires_at
FROM sessions
WHERE session_id = ${sqlText(sessionId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function remove(sessionId) {
  await runSql(`
DELETE FROM sessions
WHERE session_id = ${sqlText(sessionId)};
`);
}

async function removeExpired(now = new Date()) {
  await runSql(`
DELETE FROM sessions
WHERE expires_at <= ${sqlText(now.toISOString())};
`);
}

export const sessionsRepository = {
  create,
  readById,
  remove,
  removeExpired,
};
