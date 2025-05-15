"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Shipment, Product, ShipmentStatus, ShipmentStatusDetails, User } from "@/lib/types";
import { defaultShipmentStatuses } from "@/lib/mock-data";
import { format } from 'date-fns';
import { Truck, CheckCircle2, AlertTriangle, Clock, Printer, ThumbsUp, ShieldAlert, Package, CalendarDays, MapPin, Settings, CircleHelp, RotateCcw, PackageCheck, Ban, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ShipmentCardProps {
  shipment: Shipment;
  products: Product[];
  shipmentStatuses: ShipmentStatusDetails[];
  user: User;
  onUpdateStatus: (shipmentId: string, status: ShipmentStatus, issueDescription?: string, updatedTags?: string[]) => void;
}

export default function ShipmentCard({ shipment, products, shipmentStatuses: initialShipmentStatuses, user, onUpdateStatus }: ShipmentCardProps) {
  const [issueText, setIssueText] = useState(shipment.issueDescription || '');
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const { toast } = useToast();

  const currentStatuses = initialShipmentStatuses && initialShipmentStatuses.length > 0 ? initialShipmentStatuses : defaultShipmentStatuses;
  const statusDetails = currentStatuses.find(s => s.id === shipment.status);

  const getProductDetails = (productId: string): Product | undefined => {
    return products.find(p => p.id === productId);
  };

  const handleStatusChange = (newStatusId: ShipmentStatus) => {
    if (shipment.status === 'cancelled') {
        toast({ variant: "destructive", title: "Action Invalid", description: "Cannot change status of a cancelled shipment." });
        return;
    }
    if (newStatusId === 'with-issue' && user.role === 'logistics') {
        toast({ variant: "destructive", title: "Action Invalid", description: "Logistics cannot directly set to 'With Issue'. Track team reports issues." });
        return;
    }

    let tagsForUpdate: string[] = [newStatusId];
    // If logistics resolves an issue, status becomes 'pending-confirmation', and 'order-confirmed' should be kept if it was there.
    if (newStatusId === 'pending-confirmation' && shipment.status === 'with-issue') {
        if (shipment.isOrderConfirmed) {
            tagsForUpdate.push('order-confirmed');
        }
    }
    // If logistics cancels, all other app-managed status tags are implicitly removed by sending only ['cancelled'].
    // 'order-confirmed' is an app-managed tag, so it will be removed if not included.

    if (newStatusId === 'with-issue' && user.role === 'track-team') {
      setIssueText(shipment.issueDescription || '');
      setIsIssueDialogOpen(true); // Dialog will handle calling onUpdateStatus with appropriate tags
    } else {
      onUpdateStatus(shipment.id, newStatusId, undefined, tagsForUpdate);
    }
  };

  const handleConfirmOrder = () => {
    if (shipment.status === 'pending-confirmation' && !shipment.isOrderConfirmed) {
      // New status is 'in-transit', and it becomes 'order-confirmed'
      onUpdateStatus(shipment.id, 'in-transit', undefined, ['in-transit', 'order-confirmed']);
    }
  };

  const handleConfirmReceipt = () => {
     if (shipment.status === 'in-transit') {
        // New status is 'delivered', keep 'order-confirmed'
        onUpdateStatus(shipment.id, 'delivered', undefined, ['delivered', 'order-confirmed']);
     }
  };

  const handleReportIssueConfirm = () => {
    if (!issueText.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please describe the issue." });
      return;
    }
    if (shipment.status === 'in-transit' || shipment.status === 'pending-confirmation') {
       const tagsForIssue: string[] = ['with-issue'];
       if (shipment.isOrderConfirmed) { // Preserve 'order-confirmed' if it was already set
         tagsForIssue.push('order-confirmed');
       }
       onUpdateStatus(shipment.id, 'with-issue', issueText, tagsForIssue);
       setIsIssueDialogOpen(false);
    } else {
        toast({ variant: "destructive", title: "Action Invalid", description: `Cannot report issue for shipment with status: ${statusDetails?.label}.` });
         setIsIssueDialogOpen(false);
    }
  };

  const handlePrintDocument = async () => {
    if (!shipment.holdedInvoiceId) {
      toast({
        variant: "destructive",
        title: "Print Error",
        description: "No invoice ID found for this shipment to print.",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const response = await fetch(`/api/invoices/${shipment.holdedInvoiceId}/pdf`);
      if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch(e){
             try {
                const textError = await response.text();
                errorData = { message: `Failed to download PDF. Server returned ${response.status}. Response: ${textError.substring(0,100)}...`};
            } catch (textE) {
                errorData = { message: `Failed to download PDF. Server returned ${response.status}.`};
            }
        }
        
        let detailMessage = errorData.message || `Failed to download PDF: ${response.statusText}`;
        if (errorData.details && typeof errorData.details === 'string') {
          const detailsSnippet = errorData.details.substring(0, 200) + (errorData.details.length > 200 ? "..." : "");
          detailMessage += ` (Details: ${detailsSnippet})`;
        } else if (errorData.details && typeof errorData.details === 'object' && errorData.details.data && typeof errorData.details.data === 'string') {
            // Handle base64 encoded PDF in error details if any
            detailMessage += ` (Raw Data in Error: ${errorData.details.data.substring(0,100)}...)`;
        } else if (errorData.details) {
          try {
            const detailsString = JSON.stringify(errorData.details);
            detailMessage += ` (Details: ${detailsString.substring(0,200) + (detailsString.length > 200 ? "..." : "")})`;
          } catch (stringifyError) {
            detailMessage += ` (Details: unparseable)`;
          }
        }
        
        // If the response Content-Type is HTML, it's likely an error page from Holded.
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
            detailMessage = `Holded returned an unexpected response type: ${contentType}. This could be an error page. (Status: ${response.status})`;
        }
        
        throw new Error(detailMessage);
      }

      const blob = await response.blob();
      if (blob.type !== 'application/pdf') {
        // Attempt to read the blob as text to see if it's an error message
        const errorText = await blob.text();
        console.error("Expected PDF, received:", blob.type, "Content:", errorText.substring(0,500));
        throw new Error(`Expected a PDF file, but received type: ${blob.type}. Content: ${errorText.substring(0,100)}...`);
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${shipment.holdedInvoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast({
        title: "Download Started",
        description: "Your invoice PDF is downloading.",
      });
    } catch (error) {
      console.error("Error printing document:", error);
      toast({
        variant: "destructive",
        title: "Print Failed",
        description: (error as Error).message || "Could not download the invoice PDF.",
        duration: 7000, 
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const getStatusIcon = (statusId: ShipmentStatus): React.ElementType => {
     const status = currentStatuses.find(s => s.id === statusId);
     if (!status || !status.iconName) return CircleHelp;

      const iconMap: { [key: string]: React.ElementType } = {
          Clock: Clock,
          Truck: Truck,
          CheckCircle2: CheckCircle2,
          AlertTriangle: AlertTriangle,
          PackageCheck: PackageCheck,
          Ban: Ban,
          RotateCcw: RotateCcw,
      };
      return iconMap[status.iconName] || CircleHelp;
  };

  const CurrentStatusIcon = getStatusIcon(shipment.status);

  const canConfirmOrder = user.role === 'track-team' && shipment.status === 'pending-confirmation' && !shipment.isOrderConfirmed;
  const canConfirmReceipt = user.role === 'track-team' && shipment.status === 'in-transit';
  const canReportIssue = user.role === 'track-team' && (shipment.status === 'in-transit' || shipment.status === 'pending-confirmation');
  const canChangeStatusLogistics = user.role === 'logistics' && shipment.status !== 'cancelled';

  const availableStatusesForDropdown = currentStatuses.filter(status => {
    if (shipment.status === 'cancelled') return false; // Cannot change status of cancelled
    if (status.id === shipment.status) return false; // Cannot change to current status

    if (user.role === 'logistics') {
      // Logistics can move 'with-issue' back to 'pending-confirmation' (resolving it)
      if (shipment.status === 'with-issue' && status.id === 'pending-confirmation') return true;
      
      // Logistics can cancel 'pending-confirmation' only if it's NOT YET confirmed by track team
      if (shipment.status === 'pending-confirmation' && !shipment.isOrderConfirmed && status.id === 'cancelled') return true;

      // Logistics CANNOT directly set to 'in-transit', 'delivered', or 'with-issue' via this dropdown.
      // These are typically results of track team actions or specific issue reporting.
      if (['in-transit', 'delivered', 'with-issue'].includes(status.id)) return false;
      
      // If order IS confirmed by track team, logistics should not be able to revert 'pending-confirmation' or 'in-transit' easily, except maybe to cancel
      if (shipment.isOrderConfirmed && (shipment.status === 'pending-confirmation' || shipment.status === 'in-transit')) {
          if (status.id === 'cancelled') return true; // Allow cancellation by logistics even if confirmed (business rule dependent)
          return false; // Otherwise, no other changes from these states if order is confirmed
      }
      // General case: if not covered above, and not one of the restricted ones for logistics, allow.
      // e.g., from 'pending-confirmation' (not confirmed) to other states (excluding restricted)
      return true; 
    } else { // Track team uses buttons for their primary actions, not this dropdown.
        return false;
    }
  });


  return (
    <Card className={cn(
        "flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow duration-300 border",
        shipment.status === 'cancelled' ? 'opacity-70 bg-muted/50' : 'border-border'
      )}>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center min-w-0 gap-1 sm:gap-2 mb-1">
          <CardTitle className="text-lg break-words flex-grow min-w-0">{shipment.title}</CardTitle>
          {statusDetails && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2 py-1 h-fit self-start sm:self-center",
                statusDetails.colorClass,
                shipment.status === 'cancelled' ? 'border-gray-400' : ''
              )}
              title={statusDetails.label}
              style={{ whiteSpace: "normal", maxWidth: "100%" }} // Permite varias líneas
            >
              <CurrentStatusIcon className="h-3 w-3 mr-1.5 flex-shrink-0 inline" />
              <span>{statusDetails.label}</span>
            </Badge>
          )}
        </div>
        <div className="space-y-0.5">
          <CardDescription className="text-xs break-all">
            ID: {shipment.id.startsWith('shp_') ? shipment.id.substring(4) : shipment.id}
          </CardDescription>
          {shipment.holdedInvoiceId && (
            <CardDescription className="text-xs break-all">
              Invoice: {shipment.holdedInvoiceId}
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-3 text-sm">
        <div className="flex items-center text-muted-foreground">
          <MapPin className="h-4 w-4 mr-2 text-primary shrink-0" />
          <span className="truncate">{shipment.origin}</span>
          <Truck className="inline h-4 w-4 mx-1 shrink-0 text-primary/80"/>
          <span className="truncate">{shipment.destination}</span>
        </div>
        <div className="flex items-center text-muted-foreground">
          <CalendarDays className="h-4 w-4 mr-2 text-primary shrink-0" />
          <span>Est. Delivery: {format(new Date(shipment.estimatedDelivery), "MMM dd, yyyy")}</span>
        </div>

        {shipment.isOrderConfirmed && shipment.status !== 'pending-confirmation' && (
            <div className="flex items-center text-xs text-blue-600">
                <PackageCheck className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span>Order Confirmed by Track Team</span>
            </div>
        )}

        {shipment.status === 'delivered' && shipment.actualDelivery && (
           <div className="flex items-center text-success">
             <CheckCircle2 className="h-4 w-4 mr-2 shrink-0"/>
             <span>Delivered: {format(new Date(shipment.actualDelivery), "MMM dd, yyyy 'at' HH:mm")}</span>
           </div>
        )}
        {shipment.status === 'with-issue' && shipment.issueDescription && (
          <div className="flex items-start text-destructive">
            <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
            <p className="text-xs break-words">Issue: {shipment.issueDescription}</p>
          </div>
        )}

        <Separator className="my-3" />
        <div>
          <h4 className="font-semibold mb-2 text-foreground flex items-center"><Package className="h-4 w-4 mr-2 text-primary" />Products:</h4>
          <ul className="space-y-2">
            {shipment.products.map(item => {
              const product = getProductDetails(item.productId);
              const aiHint = product?.name ? product.name.split(' ').slice(0, 2).join(' ') : 'product item';
              return (
                <li key={item.productId} className="flex items-center justify-between text-muted-foreground">
                  <div className="flex items-center min-w-0 mr-2">
                    {product?.imageUrl ? (
                       <Image src={product.imageUrl} alt={product.name || 'Product image'} width={32} height={32} className="rounded-sm mr-2 object-cover shrink-0" data-ai-hint={aiHint}/>
                    ) : <div className="w-8 h-8 bg-muted rounded-sm mr-2 flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-muted-foreground"/></div>}
                    <span className='truncate'>{product?.name || 'Unknown Product'}</span>
                  </div>
                  <span className="font-medium text-foreground shrink-0 ml-2">x {item.units}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end items-center gap-2 pt-4 border-t bg-muted/30 px-4 py-3">
         <Button
            variant="outline"
            size="sm"
            className="h-auto min-h-[36px] px-3 py-1.5 text-xs sm:text-sm grow sm:grow-0 flex items-center justify-center"
            onClick={handlePrintDocument}
            disabled={shipment.status === 'cancelled' || !shipment.holdedInvoiceId || isPrinting}
          >
            {isPrinting ? <Loader2 className="animate-spin mr-1.5 h-4 w-4 flex-shrink-0" /> : <Printer className="mr-1.5 h-4 w-4 flex-shrink-0" />}
            <span className="whitespace-nowrap leading-tight">Print Doc</span>
          </Button>

         {canConfirmOrder && (
            <Button variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50 h-auto min-h-[36px] px-3 py-1.5 text-xs sm:text-sm grow sm:grow-0 flex items-center justify-center" onClick={handleConfirmOrder} disabled={shipment.status === 'cancelled'}>
                <PackageCheck className="mr-1.5 h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap leading-tight">Confirm Order</span>
            </Button>
         )}

        {canConfirmReceipt && (
            <Button variant="outline" size="sm" className="btn-success-outline h-auto min-h-[36px] px-3 py-1.5 text-xs sm:text-sm grow sm:grow-0 flex items-center justify-center" onClick={handleConfirmReceipt} disabled={shipment.status === 'cancelled'}>
                <ThumbsUp className="mr-1.5 h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap leading-tight">Confirm Receipt</span>
            </Button>
        )}

        {canReportIssue && (
          <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="bg-destructive/90 hover:bg-destructive h-auto min-h-[36px] px-3 py-1.5 text-xs sm:text-sm grow sm:grow-0 flex items-center justify-center" disabled={shipment.status === 'cancelled' || shipment.status === 'delivered'}>
                <ShieldAlert className="mr-1.5 h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap leading-tight">Report Issue</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Report Issue for Shipment {shipment.id.split('_')[1]}</DialogTitle>
                <DialogDescription>
                  Describe the issue. Status will change to 'With Issue'.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Label htmlFor={`issue-description-${shipment.id}`} className="sr-only">Description</Label>
                <Textarea
                  id={`issue-description-${shipment.id}`}
                  value={issueText}
                  onChange={(e) => setIssueText(e.target.value)}
                  placeholder="e.g., Package damaged, items missing..."
                  rows={4}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleReportIssueConfirm}>Report Issue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

         {canChangeStatusLogistics && (
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-auto min-h-[36px] px-3 py-1.5 text-xs sm:text-sm grow sm:grow-0 flex items-center justify-center" disabled={shipment.status === 'cancelled'}>
                        <Settings className="mr-1.5 h-4 w-4 flex-shrink-0" />
                        <span className="whitespace-nowrap leading-tight">Change Status</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Set Status To:</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableStatusesForDropdown.map(status => (
                            <DropdownMenuItem key={status.id} onClick={() => handleStatusChange(status.id)}>
                                {React.createElement(getStatusIcon(status.id), {className: "mr-2 h-4 w-4"})}
                                {status.label}
                            </DropdownMenuItem>
                        ))
                    }
                     {availableStatusesForDropdown.length === 0 && (
                        <DropdownMenuItem disabled>No direct status changes available</DropdownMenuItem>
                    )}
                </DropdownMenuContent>
             </DropdownMenu>
         )}
      </CardFooter>
    </Card>
  );
}

