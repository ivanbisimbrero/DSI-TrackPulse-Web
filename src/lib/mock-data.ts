
import type { Product, Shipment, User, ShipmentStatusDetails } from './types';
import { toast } from '@/hooks/use-toast';


// --- Mock Users ---
export const mockUser: User = {
  id: 'user_001',
  email: 'logistics@trackpulse.com',
  name: 'Alex Logistics',
  avatarUrl: 'https://picsum.photos/seed/user_alex/100/100',
  role: 'logistics',
};

export const mockTrackUser: User = {
  id: 'user_002',
  email: 'trackteam@trackpulse.com',
  name: 'Casey Track',
  avatarUrl: 'https://picsum.photos/seed/user_casey/100/100',
  role: 'track-team',
};


// --- Default Shipment Status Definitions ---
export const defaultShipmentStatuses: ShipmentStatusDetails[] = [
    { id: 'pending-confirmation', label: 'Pending Confirmation', iconName: 'PackageCheck', colorClass: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-700/30 dark:text-orange-400 dark:border-orange-700' },
    { id: 'in-transit', label: 'In Transit', iconName: 'Truck', colorClass: 'bg-primary/20 text-primary border-primary/30 dark:bg-primary/30 dark:text-primary' },
    { id: 'delivered', label: 'Delivered', iconName: 'CheckCircle2', colorClass: 'bg-success/20 text-success border-success/30 dark:bg-success/30 dark:text-success' },
    { id: 'with-issue', label: 'With Issue', iconName: 'AlertTriangle', colorClass: 'bg-destructive/20 text-destructive border-destructive/30 dark:bg-destructive/30 dark:text-destructive' },
    { id: 'cancelled', label: 'Cancelled', iconName: 'Ban', colorClass: 'bg-muted text-muted-foreground border-border dark:bg-muted/30 dark:text-muted-foreground' },
];

// --- Mock Shipments (Updated with new status) ---
// Using localStorage now, this might not be directly used unless localStorage is empty
export const mockShipments: Shipment[] = [
  {
    id: 'shp_001',
    title: 'Montmeló GP Supplies - Batch 1',
    status: 'pending-confirmation', // Start waiting for track team
    isOrderConfirmed: false,
    products: [
      { productId: 'prod_wheel_front', quantity: 10 },
      { productId: 'prod_wing_rear', quantity: 2 },
      { productId: 'prod_fuel_drum', quantity: 20 },
    ],
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    origin: 'Factory A',
    destination: 'Circuit de Barcelona-Catalunya',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Example: 5 days ago
  },
  {
    id: 'shp_002',
    title: 'Silverstone Pre-Race Stock',
    status: 'in-transit', // Assume this one was confirmed
    isOrderConfirmed: true,
    products: [
      { productId: 'prod_tyre_soft', quantity: 15 },
      { productId: 'prod_wing_front', quantity: 1 },
      { productId: 'prod_brake_disc', quantity: 5 },
    ],
    estimatedDelivery: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    origin: 'Warehouse B',
    destination: 'Silverstone Circuit',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // Example: 3 days ago
  },
  {
    id: 'shp_003',
    title: 'Monza Track Resupply',
    status: 'delivered',
    isOrderConfirmed: true,
    products: [
      { productId: 'prod_wheel_front', quantity: 5 },
      { productId: 'prod_fuel_drum', quantity: 10 },
    ],
    estimatedDelivery: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    actualDelivery: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60*60*1000).toISOString(),
    origin: 'Factory C',
    destination: 'Autodromo Nazionale Monza',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Example: 7 days ago
  },
  {
    id: 'shp_004',
    title: 'Spa-Francorchamps Urgent Parts',
    status: 'with-issue',
    isOrderConfirmed: true,
    products: [
      { productId: 'prod_wing_rear', quantity: 1 },
    ],
    estimatedDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    actualDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    issueDescription: 'Package damaged upon arrival. Wing element cracked.',
    origin: 'Supplier D',
    destination: 'Circuit de Spa-Francorchamps',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // Example: 4 days ago
  },
];


// --- Product Fetching ---
// Function to fetch products via the local API proxy to Holded
export async function fetchProducts(): Promise<Product[]> {
  const localApiUrl = '/api/products'; 

  try {
    console.log(`Fetching products from local proxy: ${localApiUrl}`);
    const response = await fetch(localApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      let errorText = 'Failed to fetch products.';
      try {
        const errorData = await response.json();
        errorText = errorData.message || JSON.stringify(errorData);
      } catch (e) { 
         try {
            errorText = await response.text();
         } catch (textErr) { /* ignore */ }
      }
      console.error(`Error fetching products from proxy: ${response.status} ${response.statusText}`, errorText);
      toast({ 
        variant: "destructive",
        title: "Product Load Failed",
        description: `Could not load products from Holded (${response.status}): ${errorText.substring(0,100)}`,
      });
      return []; 
    }

    const productsData: Product[] = await response.json();
    // Ensure price is a number, default to 0 if not.
    const products = productsData.map(p => ({...p, price: typeof p.price === 'number' ? p.price : 0}));
    console.log("Successfully fetched products:", products.length);
    return products;

  } catch (error) {
    console.error('Network/Fetch error or JSON parse error fetching products via proxy:', error);
     toast({ 
        variant: "destructive",
        title: "Network Error",
        description: "Could not connect to fetch product data. Check your connection.",
      });
    return []; 
  }
}

