-- Migration to support Quill WYSIWYG editor
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS html_content TEXT;
