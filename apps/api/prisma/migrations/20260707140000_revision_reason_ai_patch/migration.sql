-- Add AI_PATCH to the RevisionReason enum (AI-directed scoped edits).
ALTER TYPE "RevisionReason" ADD VALUE IF NOT EXISTS 'AI_PATCH';
