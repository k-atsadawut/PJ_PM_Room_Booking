-- Add Description field to rooms table for equipment/details
ALTER TABLE rooms ADD COLUMN Description VARCHAR(255) NULL AFTER Status;
