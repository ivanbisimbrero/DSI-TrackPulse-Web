
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import KeyIndicatorCard from './KeyIndicatorCard';
import ShipmentList from './ShipmentList';
import LogisticsCopilotWidget from './LogisticsCopilotWidget';
import { CreateShipmentForm } from './CreateShipmentForm';
import { defaultShipmentStatuses, fetchProducts as apiFetchProducts } from '@/lib/mock-data';
import type { Shipment, Product, NewShipmentData, ShipmentStatus, ShipmentStatusDetails, User, HoldedCustomField } from '@/lib/types';
import { Package, AlertOctagon, Clock3, TrendingUp, Boxes, Truck, PlusCircle, PackageCheck, Loader2, ServerCrash } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardSkeleton } from './DashboardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isValid, differenceInMilliseconds, parseISO } from 'date-fns';


async function updateStockInHoldedAPI(productId: string, unitsChange: number, toastFn: ReturnType<typeof useToast>['toast']): Promise<boolean> {
  try {
    const response = await fetch(`/api/products/${productId}/stock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Math.floor(unitsChange) }),
    });

    if (!response.ok) {
      let errorDetails: any = `Holded API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || errorData.details || JSON.stringify(errorData);
        if (typeof errorData === 'object' && Object.keys(errorData).length === 0 && response.statusText) {
            errorDetails = response.statusText;
        }
      } catch (e) {
         try {
            const textError = await response.text();
            errorDetails = textError || `Unexpected server error during stock update (status ${response.status})`;
        } catch (textErr) {
            errorDetails = `Unexpected server error during stock update (status ${response.status}), and failed to read error text.`;
        }
        console.warn(`Could not parse error response as JSON for ${productId} (stock update). Raw error: ${errorDetails.substring(0,200)}`);
      }
      console.error(`Failed to update stock in Holded for ${productId}:`, errorDetails);
      toastFn({
        variant: "destructive",
        title: "Holded Stock Sync Failed",
        description: `Could not update stock for ${productId}: ${errorDetails.substring(0,150)}`,
        duration: 7000,
      });
      return false;
    }
    console.log(`Stock for product ${productId} updated in Holded by ${unitsChange}.`);
    return true;
  } catch (error) {
    console.error(`Network error updating stock for ${productId} in Holded:`, error);
    toastFn({
      variant: "destructive",
      title: "Network Error (Stock Update)",
      description: `Failed to communicate with Holded to update stock for ${productId}.`,
      duration: 7000,
    });
    return false;
  }
}


interface HoldedInvoiceItem {
  name: string;
  units: number;
  price: number;
  tax: string;
  sku?: string;
}


export default function ShipmentOverview() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateShipmentDialogOpen, setIsCreateShipmentDialogOpen] = useState(false);
  const [shipmentStatuses] = useState<ShipmentStatusDetails[]>(defaultShipmentStatuses);
  const { toast } = useToast();


  const fetchShipmentsFromApi = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/invoices');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to fetch shipments from API (${response.status})`);
      }
      const data: Shipment[] = await response.json();

      setShipments(data.map(s => ({
        ...s,
        estimatedDelivery: s.estimatedDelivery && isValid(parseISO(s.estimatedDelivery)) ? parseISO(s.estimatedDelivery).toISOString() : new Date().toISOString(),
        actualDelivery: s.actualDelivery && isValid(parseISO(s.actualDelivery)) ? parseISO(s.actualDelivery).toISOString() : undefined,
        createdAt: s.createdAt && isValid(parseISO(s.createdAt)) ? parseISO(s.createdAt).toISOString() : new Date().toISOString(),
      })));

    } catch (error) {
      console.error("Failed to load shipments from API:", error);
      toast({
        variant: "destructive",
        title: "Error Loading Shipments",
        description: (error as Error).message || "Could not load shipments from the server.",
      });
      setShipments([]);
    }
  }, [toast, user]);


  useEffect(() => {
    const loadInitialData = async () => {
      if (!user) {
        setIsLoading(false);
        setProducts([]);
        setShipments([]);
        return;
      }
      setIsLoading(true);
      try {
        const fetchedProducts = await apiFetchProducts();
        setProducts(fetchedProducts);
        await fetchShipmentsFromApi();
      } catch (error) {
        console.error("Error during initial data load sequence:", error);
        // Toast handled in individual fetch functions
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, [user, fetchShipmentsFromApi, toast]);


 const handleAddShipment = async (newShipmentData: NewShipmentData): Promise<boolean> => {
    setIsSubmitting(true);

    for (const item of newShipmentData.products) {
      const product = products.find(p => p.id === item.productId);
      if (!product || product.stockLevel < item.units) {
        toast({
          variant: "destructive",
          title: "Insufficient Local Stock",
          description: `Not enough local stock for ${product?.name || item.productId}. Available: ${product?.stockLevel || 0}, Requested: ${item.units}. Invoice creation aborted.`,
        });
        setIsSubmitting(false);
        return false;
      }
    }

    const tempShipmentIdSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tempShipmentId = `shp_${tempShipmentIdSuffix}`;

    const invoiceItems: HoldedInvoiceItem[] = newShipmentData.products.map(shipmentItem => {
      const productDetails = products.find(p => p.id === shipmentItem.productId);
      return {
        name: productDetails?.name || `Product ${shipmentItem.productId}`,
        units: shipmentItem.units,
        price: productDetails?.price || 0,
        tax: "s_iva_21",
        sku: productDetails?.sku || undefined,
      };
    });

    const estimatedDeliveryDate = parseISO(newShipmentData.estimatedDelivery);
    const notesForHolded = `Shipment Title: ${newShipmentData.title}\nOrigin: ${newShipmentData.origin}\nDestination: ${newShipmentData.destination}\nEst. Delivery: ${isValid(estimatedDeliveryDate) ? format(estimatedDeliveryDate, 'yyyy-MM-dd') : 'N/A'}\nInternal Shipment ID: ${tempShipmentId}\nOrder Confirmed: false`;

    const invoicePayload = {
      contactId: "clth9pt0a000008l30176h2yv",
      items: invoiceItems,
      desc: `Invoice for Shipment: ${newShipmentData.title} (TrackPulse ID: ${tempShipmentIdSuffix})`,
      date: Math.floor(Date.now() / 1000),
      tags: ['pending-confirmation'] as ShipmentStatus[],
      notes: notesForHolded,
    };

    try {
      const invoiceResponse = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload),
      });

      const responseText = await invoiceResponse.text();
      let createdHoldedInvoice: any;
      try {
        createdHoldedInvoice = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse Holded invoice creation response as JSON. Body:", responseText);
        toast({ variant: "destructive", title: "Invoice Creation Error", description: "Received unparseable response from Holded." });
        setIsSubmitting(false);
        return false;
      }
      
      if (!invoiceResponse.ok) {
        const errorMsg = createdHoldedInvoice.message || createdHoldedInvoice.info || `Error ${invoiceResponse.status}: ${invoiceResponse.statusText || 'Failed to create invoice'}`;
        console.error("Failed to create Holded invoice. Status:", invoiceResponse.status, "Response:", createdHoldedInvoice);
        toast({ variant: "destructive", title: "Invoice Creation Failed", description: errorMsg });
        setIsSubmitting(false);
        return false;
      }
      
      const holdedInvData = createdHoldedInvoice.data || createdHoldedInvoice;

      if (!holdedInvData || !holdedInvData.id || (holdedInvData.status !== undefined && holdedInvData.status !== 1)) {
        console.error("Holded invoice creation response missing expected fields or indicated an issue:", createdHoldedInvoice);
        toast({ variant: "destructive", title: "Invoice Data Error", description: "Received incomplete or problematic data from Holded." });
        setIsSubmitting(false);
        return false;
      }
      
      const invoiceCreationTimestamp = holdedInvData.date ? new Date(holdedInvData.date * 1000).toISOString() : new Date().toISOString();

      const updatedLocalProducts = products.map(p => {
        const shippedItem = newShipmentData.products.find(si => si.productId === p.id);
        if (shippedItem) {
          return { ...p, stockLevel: p.stockLevel - shippedItem.units };
        }
        return p;
      });
      setProducts(updatedLocalProducts);

      toast({
        title: "Shipment & Invoice Created",
        description: `Shipment "${newShipmentData.title}" (Invoice ${holdedInvData.docNumber || holdedInvData.id}) created. Local stock updated.`,
      });

      await fetchShipmentsFromApi();
      setIsSubmitting(false);
      setIsCreateShipmentDialogOpen(false);
      return true;

    } catch (error) {
      console.error("Error during shipment creation process:", error);
      toast({
        variant: "destructive",
        title: "Creation Process Error",
        description: (error as Error).message || "An unexpected error occurred during creation.",
      });
      setIsSubmitting(false);
      return false;
    }
  };

  const getStatusLabel = useCallback((statusId: ShipmentStatus): string => {
    return shipmentStatuses.find(s => s.id === statusId)?.label || statusId;
  }, [shipmentStatuses]);

 const handleUpdateShipmentStatus = async (shipmentId: string, newStatus: ShipmentStatus, issueDescription?: string, updatedTagsFromClient?: string[]) => {
    setIsSubmitting(true);
    const currentShipmentIndex = shipments.findIndex(s => s.id === shipmentId);

    if (currentShipmentIndex === -1 || !user || !shipments[currentShipmentIndex].holdedInvoiceId) {
      toast({ variant: "destructive", title: "Update Error", description: "Shipment, user, or Holded Invoice ID not found." });
      setIsSubmitting(false);
      return;
    }

    const currentShipment = shipments[currentShipmentIndex];
    console.log("Current shipment data:", currentShipment);
    const originalStatus = currentShipment.status;
    const holdedInvoiceId = currentShipment.holdedInvoiceId!;

    let actualDeliveryTimestamp: string | undefined = currentShipment.actualDelivery;
    if (newStatus === 'delivered' && originalStatus === 'in-transit' && user.role === 'track-team') {
      actualDeliveryTimestamp = new Date().toISOString();
    }

    let isConfirmed = currentShipment.isOrderConfirmed ?? false;
    if (updatedTagsFromClient?.includes('order-confirmed')) {
        isConfirmed = true;
    } else if (newStatus === 'cancelled' || (newStatus === 'pending-confirmation' && originalStatus === 'with-issue')) {
        isConfirmed = updatedTagsFromClient?.includes('order-confirmed') ?? currentShipment.isOrderConfirmed ?? false;
    }

    const finalIssueDescription = (newStatus === 'with-issue')
      ? issueDescription
      : (originalStatus === 'with-issue' && newStatus !== 'cancelled') 
        ? undefined 
        : currentShipment.issueDescription;

    const updatedShipmentForLocalState: Shipment = {
      ...currentShipment,
      status: newStatus,
      isOrderConfirmed: isConfirmed,
      issueDescription: finalIssueDescription,
      actualDelivery: actualDeliveryTimestamp,
      tags: updatedTagsFromClient || currentShipment.tags,
    };

    setShipments(prevShipments => {
      const newShipments = [...prevShipments];
      newShipments[currentShipmentIndex] = updatedShipmentForLocalState;
      return newShipments;
    });

    const notesForHoldedParts = [
      `Shipment Title: ${updatedShipmentForLocalState.title}`,
      `Origin: ${updatedShipmentForLocalState.origin}`,
      `Destination: ${updatedShipmentForLocalState.destination}`,
      `Est. Delivery: ${format(parseISO(updatedShipmentForLocalState.estimatedDelivery), 'yyyy-MM-dd')}`,
      `Internal Shipment ID: ${updatedShipmentForLocalState.id}`,
      `Order Confirmed: ${isConfirmed}`
    ];
    if (actualDeliveryTimestamp) {
      // Store actualDeliveryTimestamp as ISO string in notes
      notesForHoldedParts.push(`Actual Delivery: ${actualDeliveryTimestamp}`);
    }
    if (finalIssueDescription) {
      notesForHoldedParts.push(`Issue: ${finalIssueDescription}`);
    }
    const notesForHolded = notesForHoldedParts.join('\n');

    const payloadForApi: { notes: string; tags?: string[] } = { notes: notesForHolded };
    if (updatedTagsFromClient) {
      payloadForApi.tags = updatedTagsFromClient;
    }

    try {
      const response = await fetch(`/api/invoices/${holdedInvoiceId}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadForApi),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to update Holded invoice (${response.status})`);
      }

      toast({
        title: "Shipment Updated",
        description: `Shipment ${shipmentId.substring(4)} status to ${getStatusLabel(newStatus)}. Synced with Holded.`,
      });

      if (newStatus === 'cancelled' && originalStatus === 'pending-confirmation' && !currentShipment.isOrderConfirmed && user.role === 'logistics') {
        let allStockRestoredInHolded = true;
        for (const item of currentShipment.products) {
          const success = await updateStockInHoldedAPI(item.productId, Math.round(item.units), toast);
          if (!success) {
            allStockRestoredInHolded = false;
          }
        }
        if (allStockRestoredInHolded) {
          toast({ title: "Stock Restored", description: "Stock for cancelled shipment items restored in Holded." });
          const updatedLocalProducts = products.map(p => {
            const cancelledItem = currentShipment.products.find(si => si.productId === p.id);
            if (cancelledItem) {
              return { ...p, stockLevel: p.stockLevel + cancelledItem.units };
            }
            return p;
          });
          setProducts(updatedLocalProducts);
        } else {
           toast({ variant: "destructive", title: "Partial Stock Restore", description: "Some product stock could not be restored in Holded. Manual check needed." });
        }
      }

      await fetchShipmentsFromApi();

    } catch (error) {
      console.error("Failed to update Holded invoice or dependent operations:", error);
      toast({
        variant: "destructive",
        title: "Sync Error",
        description: (error as Error).message || "Could not sync shipment update with Holded.",
      });
       setShipments(prevShipments => {
         const revertedShipments = [...prevShipments];
         revertedShipments[currentShipmentIndex] = currentShipment;
         return revertedShipments;
       });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateIndicators = useCallback(() => {
    if (!user || shipments.length === 0) {
      return { dailyShipmentsCount: 0, failedDeliveriesCount: 0, avgDeliveryTime: 'N/A' };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const dailyShipmentsCount = shipments.filter(s => {
      const createdAtDate = parseISO(s.createdAt);
      return isValid(createdAtDate) && createdAtDate.getTime() >= todayStart;
    }).length;

    const failedDeliveriesCount = shipments.filter(s => s.status === 'with-issue').length;

    const deliveredShipmentsWithTime = shipments.filter(s =>
      s.status === 'delivered' &&
      s.actualDelivery &&
      s.createdAt &&
      isValid(parseISO(s.createdAt)) &&
      isValid(parseISO(s.actualDelivery))
    );
    
    let avgDeliveryTime = 'N/A';

    if (deliveredShipmentsWithTime.length > 0) {
      const durations = deliveredShipmentsWithTime.map(s => {
        const createdDate = parseISO(s.createdAt!);
        const deliveredDate = parseISO(s.actualDelivery!);
        if (isValid(createdDate) && isValid(deliveredDate)) {
          return differenceInMilliseconds(deliveredDate, createdDate);
        }
        return null; 
      }).filter(d => d !== null && d >= 0) as number[];

      if (durations.length > 0) {
        const totalDeliveryDurationMs = durations.reduce((acc, d) => acc + d, 0);
        const avgDurationMs = totalDeliveryDurationMs / durations.length;
        const totalSeconds = Math.floor(avgDurationMs / 1000);

        if (totalSeconds === 0 && avgDurationMs >= 0) { 
          avgDeliveryTime = '0s';
        } else {
          const days = Math.floor(totalSeconds / 86400);
          const hours = Math.floor((totalSeconds % 86400) / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          let timeParts = [];
          if (days > 0) timeParts.push(`${days}d`);
          if (hours > 0) timeParts.push(`${hours}h`);
          if (minutes > 0) timeParts.push(`${minutes}m`);
          
          if (seconds > 0 || (days === 0 && hours === 0 && minutes === 0)) {
            timeParts.push(`${seconds}s`);
          }
          avgDeliveryTime = timeParts.length > 0 ? timeParts.join(' ') : '0s'; // Ensure 0s if no parts but totalSeconds was 0
        }
      } else {
        avgDeliveryTime = 'Error'; // No valid positive durations
      }
    }

    return { dailyShipmentsCount, failedDeliveriesCount, avgDeliveryTime };
  }, [shipments, user]);

  const { dailyShipmentsCount, failedDeliveriesCount, avgDeliveryTime } = calculateIndicators();

  if (isLoading || !user) {
    return <DashboardSkeleton showLogistics={user?.role === 'logistics' || false} />;
  }

  const isLogisticsUser = user.role === 'logistics';

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8 space-y-8">
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-foreground flex items-center">
          <TrendingUp className="mr-3 h-7 w-7 text-primary" /> Key Indicators
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KeyIndicatorCard title="Shipments Created Today" value={isLoading ? <Skeleton className="h-6 w-10 inline-block" /> : dailyShipmentsCount} icon={Truck} description={isLoading ? <Skeleton className="h-4 w-32" /> : `${shipments.length} total synced`} />
          <KeyIndicatorCard title="Failed/Issue Deliveries" value={isLoading ? <Skeleton className="h-6 w-10 inline-block" /> : failedDeliveriesCount} icon={AlertOctagon} iconColorClassName="text-destructive" description="Requires attention" />
          <KeyIndicatorCard title="Avg. Delivery Time" value={isLoading ? <Skeleton className="h-6 w-20 inline-block" /> : avgDeliveryTime} icon={Clock3} description="From creation to delivery" />
          <KeyIndicatorCard title="Product Types Tracked" value={isLoading ? <Skeleton className="h-6 w-10 inline-block" /> : products.length} icon={Package} description="Managed products" />
        </div>
      </section>

      <Separator />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center shrink-0">
              <Truck className="mr-3 h-7 w-7 text-primary" /> Shipment Status
            </h2>
            {isLogisticsUser && (
              <Dialog open={isCreateShipmentDialogOpen} onOpenChange={setIsCreateShipmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button disabled={isSubmitting || isLoading}>
                    {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Add New Shipment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Create New Shipment</DialogTitle>
                    <DialogDescription>
                      Fill in details. An invoice will be created in Holded. Local stock will reflect changes.
                    </DialogDescription>
                  </DialogHeader>
                  <CreateShipmentForm
                    availableProducts={products.filter(p => p.stockLevel > 0)}
                    onAddShipment={handleAddShipment}
                    onClose={() => setIsCreateShipmentDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
          <ShipmentList
            shipments={shipments}
            onUpdateShipmentStatus={handleUpdateShipmentStatus}
            products={products}
            shipmentStatuses={shipmentStatuses}
            user={user}
          />
        </div>

        <div className="lg:col-span-1 space-y-8">
          {isLogisticsUser && (
            <div>
              <h2 className="text-2xl font-semibold mb-4 text-foreground flex items-center">
                <Boxes className="mr-3 h-7 w-7 text-primary" /> Stock Levels (Local Cache)
              </h2>
              <Card className="shadow-md border">
                 <CardHeader className="pb-2 pt-4 px-4">
                    <CardDescription className="text-xs">
                        Stock levels are initially from Holded, then updated locally on shipment creation/cancellation. Holded is the source of truth for stock during invoice creation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 max-h-[350px] overflow-y-auto">
                  {isLoading && products.length === 0 ? (
                    [...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full my-2 rounded-md" />)
                  ) : products.length > 0 ? (
                    products.map(product => (
                      <div key={product.id} className="flex justify-between items-center text-sm p-2 hover:bg-muted/50 rounded-md">
                        <span className="text-muted-foreground truncate pr-2">{product.name || 'Unknown Product'} ({product.sku || 'No SKU'})</span>
                        <span className={`font-semibold shrink-0 ${product.stockLevel < 20 ? 'text-destructive' : product.stockLevel < 50 ? 'text-amber-600' : 'text-success'}`}>
                          {product.stockLevel !== undefined ? `${product.stockLevel} units` : 'N/A'}
                        </span>
                      </div>
                    ))
                  ) : (
                     <div className="text-center py-4">
                        <ServerCrash className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No products found or failed to load.</p>
                        <p className="text-xs text-muted-foreground mt-1">Ensure Holded API key is correct and service is reachable for initial load.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {isLogisticsUser && (
            <LogisticsCopilotWidget products={products} />
          )}
           {!isLogisticsUser && (
              <Card className="min-h-[200px] flex flex-col justify-center shadow-md border">
                  <CardHeader>
                    <CardTitle className='text-lg flex items-center'>
                        <PackageCheck className="mr-2 h-5 w-5 text-primary"/>Track Team Actions
                    </CardTitle>
                    <CardDescription>Manage shipment progress based on your role.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li>Confirm pending orders to mark them as 'In Transit'.</li>
                      <li>Confirm receipt of 'In Transit' shipments to mark them 'Delivered'.</li>
                      <li>Report issues for shipments.</li>
                    </ul>
                  </CardContent>
              </Card>
           )}
        </div>
      </section>
    </div>
  );
}
