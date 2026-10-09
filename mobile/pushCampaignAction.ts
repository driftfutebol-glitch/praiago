export function campaignDestination(data: Record<string, unknown>, app: string, userId: string | null): 'home' | 'orders' | null {
  if (!userId || data.user_id !== userId || data.app !== app || data.kind !== 'campaign'
    || typeof data.campaign_id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.campaign_id)) return null
  return data.destination === 'home' || data.destination === 'orders' ? data.destination : null
}
