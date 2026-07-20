export interface LocationUpdate {
  order_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
}

export interface TrackingLink {
  id: string;
  token: string;
  order_id: string;
  rider_id: string;
  customer_id: string;
  status: 'active' | 'delivered' | 'expired';
  created_at: string;
  expires_at: string;
  location?: LocationUpdate | null;
}
