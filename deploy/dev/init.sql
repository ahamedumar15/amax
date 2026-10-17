-- The app logs in as amax_app: it owns nothing and has no BYPASSRLS, so row-level security applies.
create role amax_app login password 'amax_app';
