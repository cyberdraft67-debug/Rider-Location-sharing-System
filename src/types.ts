export interface LocationUpdate {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
}

export interface Order {
  id: string;
  customer_token: string;
  rider_token: string;
  status: 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  rider_name?: string;
  rider_phone?: string;
  destination_lat?: number;
  destination_lng?: number;
  last_lat?: number;
  last_lng?: number;
  last_heading?: number;
  last_speed?: number;
  last_updated?: string;
  location_history?: LocationUpdate[];
  created_at?: string;
}
