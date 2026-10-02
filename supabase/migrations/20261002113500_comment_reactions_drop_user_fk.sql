-- INCIDENT FIX (02/10): with comment_reactions holding FKs to both comments
-- and users, PostgREST saw it as a comments<->users junction, so every
-- `comments?select=...,users(name)` embed became ambiguous (HTTP 300) and
-- the chat showed no messages. Dropping the users FK removes that second
-- path. Any future embed from comments to users should still name the FK
-- explicitly: users!comments_user_id_fkey(name).
alter table public.comment_reactions drop constraint comment_reactions_user_id_fkey;
notify pgrst, 'reload schema';
