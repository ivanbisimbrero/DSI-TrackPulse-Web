
"use client";

import React, { useState, useMemo } from 'react';
import type { Shipment, ShipmentStatus, Product, ShipmentStatusDetails, User } from '@/lib/types';
import ShipmentCard from './ShipmentCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PackageCheck } from 'lucide-react';

interface ShipmentListProps {
  shipments: Shipment[];
  products: Product[];
  shipmentStatuses: ShipmentStatusDetails[];
  user: User;
  onUpdateShipmentStatus: (shipmentId: string, status: ShipmentStatus, issueDescription?: string) => void;
}

// Define tabs based on available statuses + 'all'
const getTabs = (statuses: ShipmentStatusDetails[]) => {
  // Explicitly define the order and inclusion of tabs
  const tabOrder: (ShipmentStatus | 'all')[] = ['all', 'pending-confirmation', 'in-transit', 'delivered', 'with-issue', 'cancelled'];
  
  return tabOrder.map(value => {
    if (value === 'all') {
      return { value: 'all', label: 'All Shipments' };
    }
    const statusDetail = statuses.find(s => s.id === value);
    return statusDetail ? { value: statusDetail.id, label: statusDetail.label } : null;
  }).filter(tab => tab !== null) as { value: ShipmentStatus | 'all'; label: string }[]; // Ensure correct type after filter
};


export default function ShipmentList({ shipments, products, shipmentStatuses, user, onUpdateShipmentStatus }: ShipmentListProps) {
  const [activeTab, setActiveTab] = useState<ShipmentStatus | 'all'>('all');

  const TABS = useMemo(() => getTabs(shipmentStatuses), [shipmentStatuses]);

  const filteredShipments = useMemo(() => {
    if (activeTab === 'all') return shipments;
    return shipments.filter(s => s.status === activeTab);
  }, [shipments, activeTab]);

  const roleFilteredShipments = useMemo(() => {
    if (user.role === 'logistics') {
      // Logistics can see all statuses including 'cancelled'
      return filteredShipments;
    } else if (user.role === 'track-team') {
       // Track team sees actionable items, delivered, and issues. They don't typically see 'cancelled'.
       return filteredShipments.filter(s =>
         s.status === 'pending-confirmation' ||
         s.status === 'in-transit' ||
         s.status === 'delivered' ||
         s.status === 'with-issue'
         // Not including 'cancelled' for track team by default
       );
    }
    return [];
  }, [filteredShipments, user.role]);


  if (!shipments) {
    return <p className="text-center text-muted-foreground py-8">Loading shipments...</p>;
  }
  if (shipments.length === 0 && user.role === 'logistics') { 
     return <p className="text-center text-muted-foreground py-8">No shipments created yet.</p>;
  }
  if (shipments.length === 0 && user.role === 'track-team') {
      return <p className="text-center text-muted-foreground py-8">No shipments available for your team at the moment.</p>;
  }


  return (
    <div>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ShipmentStatus | 'all')} className="mb-6">
        <ScrollArea className="w-full whitespace-nowrap rounded-md">
          <TabsList className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-max">
            {TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>

      {roleFilteredShipments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roleFilteredShipments.map(shipment => (
            <ShipmentCard
                key={shipment.id}
                shipment={shipment}
                products={products}
                shipmentStatuses={shipmentStatuses}
                user={user}
                onUpdateStatus={onUpdateShipmentStatus}
            />
            ))}
        </div>
      ) : (
        // This message is shown if:
        // 1. There are shipments, but none match the current activeTab and user role filters.
        // 2. There are no shipments at all (and the user role is not 'logistics' or 'track-team', which is an edge case).
        <p className="text-center text-muted-foreground py-8">
            No shipments to display for {TABS.find(t => t.value === activeTab)?.label || activeTab} status.
        </p>
      )}
    </div>
  );
}

