import { apiPost } from '@/lib/apiFetch';
import { authClient } from '@/lib/authClient';

interface ReassignResult {
  id: string;
  phone: string;
  phoneVerified: boolean;
}

interface PhoneVerifyResult {
  verified: boolean;
  reassigned: ReassignResult | null;
}

export async function verifyPhoneAndReassign(
  phoneNumber: string,
  code: string
): Promise<PhoneVerifyResult> {
  const verifyResult = await authClient.phoneNumber.verify({
    phoneNumber,
    code,
  });

  if (verifyResult.error) {
    throw new Error(verifyResult.error.message ?? 'Phone verification failed');
  }

  let reassigned: ReassignResult | null = null;
  try {
    reassigned = await apiPost<ReassignResult>('/api/users/me/reassign-phone', {
      phone: phoneNumber,
    });
  } catch {
    // Reassignment is optional — phone may not have been previously owned
  }

  return { verified: true, reassigned };
}

export async function triggerPhoneReassignment(phone: string): Promise<ReassignResult | null> {
  try {
    const result = await apiPost<ReassignResult>('/api/users/me/reassign-phone', { phone });
    return result;
  } catch {
    return null;
  }
}
