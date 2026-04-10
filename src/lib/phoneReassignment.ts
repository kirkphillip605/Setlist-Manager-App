import { apiPost } from '@/lib/apiFetch';

interface ReassignResult {
  id: string;
  phone: string;
  phoneVerified: boolean;
}

export async function triggerPhoneReassignment(phone: string): Promise<ReassignResult | null> {
  try {
    const result = await apiPost<ReassignResult>('/api/users/me/reassign-phone', { phone });
    return result;
  } catch {
    return null;
  }
}
