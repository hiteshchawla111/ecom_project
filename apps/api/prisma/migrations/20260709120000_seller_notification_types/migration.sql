-- Additive: new NotificationType values for first-class seller notifications
-- (replaces the temporary REGISTRATION_CONFIRMATION + payload.kind workaround).
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_REJECTED';
