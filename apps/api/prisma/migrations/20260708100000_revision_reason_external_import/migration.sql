-- Add EXTERNAL_IMPORT to the RevisionReason enum (SVG/PPTX round-trip imports).
ALTER TYPE "RevisionReason" ADD VALUE IF NOT EXISTS 'EXTERNAL_IMPORT';
