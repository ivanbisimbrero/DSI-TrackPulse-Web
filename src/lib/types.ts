

// Add 'pending-confirmation' state and 'cancelled'
export type ShipmentStatus = 'pending-confirmation' | 'in-transit' | 'delivered' | 'with-issue' | 'cancelled';

export interface Product {
  id: string;
  name: string;
  stockLevel: number;
  imageUrl?: string;
  sku: string;
  price?: number; // Price is important for invoices
}

// Represents a product item within a shipment (existing)
export interface ShipmentProduct {
  productId: string;
  units: number;
}

// Represents a product item within the CreateShipmentForm
export interface ShipmentProductItem {
  productId: string;
  units: number;
}

// Represents the data structure for creating a new shipment (before ID/status)
export interface NewShipmentData {
  title: string;
  origin: string;
  destination: string;
  estimatedDelivery: string; // ISO date string
  products: ShipmentProductItem[];
}

export interface Shipment {
  id: string;
  title: string;
  status: ShipmentStatus;
  products: ShipmentProduct[];
  estimatedDelivery: string; // ISO date string
  actualDelivery?: string; // ISO date string
  issueDescription?: string;
  origin: string;
  destination: string;
  isOrderConfirmed?: boolean; // Flag for track team confirmation step
  createdAt: string; // ISO date string
  holdedInvoiceId?: string; // ID of the invoice created in Holded
  tags?: any[]; // Tags for the shipment
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: 'logistics' | 'track-team';
}

// Define details for each status, including icon name and color class
export interface ShipmentStatusDetails {
  id: ShipmentStatus;
  label: string;
  iconName: string; // Name of the Lucide icon component
  colorClass: string; // Tailwind classes for background/text/border
}

// For Holded Custom Fields
export interface HoldedCustomField {
  field: string; // Name of the custom field in Holded
  value: string; // Value of the custom field
}

    