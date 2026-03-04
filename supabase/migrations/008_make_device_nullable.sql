-- Make device_id nullable in whatsapp_messages

ALTER TABLE whatsapp_messages 
ALTER COLUMN device_id DROP NOT NULL;
