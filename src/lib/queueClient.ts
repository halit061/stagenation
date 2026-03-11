import { supabase } from './supabaseClient';

const QUEUE_TOKEN_KEY = 'queue_token';

export function getOrCreateQueueToken(): string {
  let token = localStorage.getItem(QUEUE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(QUEUE_TOKEN_KEY, token);
  }
  return token;
}

export interface QueueStatus {
  status: 'waiting' | 'admitted';
  position: number;
  active_inside: number;
  cap: number;
  flow_per_min: number;
  eta_minutes: number;
}

export async function joinQueue(eventId: string): Promise<QueueStatus> {
  const token = getOrCreateQueueToken();
  const { data, error } = await supabase.rpc('join_queue', {
    p_event_id: eventId,
    p_token: token,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as QueueStatus;
}
