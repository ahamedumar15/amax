-- Review round 1: refresh-token reuse detection (OAuth 2.1). A rotated refresh token is remembered,
-- so presenting it again revokes the whole grant (that user and client) instead of just failing.
alter table auth.api_token add column refresh_used_at timestamptz;
