-- Make organization_id nullable in whatsapp_messages

ALTER TABLE whatsapp_messages 
ALTER COLUMN organization_id DROP NOT NULL;
