"use client";

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Keep Label import if needed elsewhere, maybe not for this form
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from '@/hooks/use-toast';
import type { Product, NewShipmentData } from '@/lib/types'; // Removed ShipmentProductItem as it's implicitly handled by schema
import { PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

const productItemSchema = z.object({
  productId: z.string().min(1, "Product selection is required."),
  units: z.coerce // Use coerce for input[type=number] which often returns string
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1."),
});

const createShipmentSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters." }),
  origin: z.string().min(2, { message: "Origin is required." }),
  destination: z.string().min(2, { message: "Destination is required." }),
  estimatedDelivery: z.date({ required_error: "Estimated delivery date is required." })
    .min(new Date(new Date().setHours(0,0,0,0)), { message: "Estimated delivery date must be today or later." }), // Allow today
  products: z.array(productItemSchema)
    .min(1, { message: "At least one product is required." })
    .refine(items => { // Ensure unique products
        const productIds = items.map(item => item.productId);
        return new Set(productIds).size === productIds.length;
      }, { message: "Duplicate products selected. Please remove duplicates."}),
});

type CreateShipmentFormValues = z.infer<typeof createShipmentSchema>;

interface CreateShipmentFormProps {
  availableProducts: Product[];
  onAddShipment: (newShipment: NewShipmentData) => Promise<boolean>; // Returns true on success (stock ok), false otherwise
  onClose: () => void; // Callback to close the dialog/modal
}

export function CreateShipmentForm({ availableProducts, onAddShipment, onClose }: CreateShipmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateShipmentFormValues>({
    resolver: zodResolver(createShipmentSchema),
    defaultValues: {
      title: '',
      origin: '',
      destination: '',
      estimatedDelivery: undefined,
      products: [{ productId: '', units: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "products",
  });

  const onSubmit = async (data: CreateShipmentFormValues) => {
    setIsSubmitting(true);
    try {
        // Convert date before sending to parent
       const newShipmentData: NewShipmentData = {
         ...data,
         estimatedDelivery: data.estimatedDelivery.toISOString(),
       };

       // Call parent handler which now performs stock check and updates
       const success = await onAddShipment(newShipmentData);

       if (success) {
          // Toast is handled by parent now on success
          onClose(); // Close the form/dialog on success
       } else {
         // Error toast regarding stock is handled by the parent
         // Keep the dialog open if stock check failed
         setIsSubmitting(false); // Re-enable button if stock check failed
       }

    } catch (error) { // Catch unexpected errors during the process
      console.error("Unexpected error during shipment creation:", error);
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: "An unexpected error occurred. Please try again.",
      });
       setIsSubmitting(false); // Ensure submit button is re-enabled on unexpected error
    }
     // Don't set submitting false here if successful, as onClose handles it.
     // It's set false above only on failure paths.
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipment Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Monaco GP Supplies - Batch 1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="origin"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Origin</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., Factory A" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Destination</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., Circuit de Monaco" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <FormField
          control={form.control}
          name="estimatedDelivery"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Estimated Delivery Date</FormLabel>
              <FormControl>
                 <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select delivery date"
                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} // Disable past dates
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <Card className="border-dashed border-primary/30">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 {fields.map((item, index) => {
                    // Find the selected product to display stock level
                    const selectedProduct = availableProducts.find(p => p.id === form.watch(`products.${index}.productId`));
                    const stockLevel = selectedProduct?.stockLevel ?? 'N/A';

                    return (
                        <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-3 bg-muted/50 rounded-md border">
                            <FormField
                                control={form.control}
                                name={`products.${index}.productId`}
                                render={({ field }) => (
                                    <FormItem className="flex-1 w-full md:w-auto">
                                    {/* Screen reader label is useful here */}
                                    <FormLabel className="sr-only">Product {index + 1}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select product" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        {/* Filter out products already selected in other fields */}
                                        {availableProducts
                                            .filter(product =>
                                                !fields.some((f, i) => i !== index && f.productId === product.id) || product.id === field.value
                                            )
                                            .map((product) => (
                                                <SelectItem key={product.id} value={product.id}>
                                                    {product.name} (Stock: {product.stockLevel})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name={`products.${index}.units`}
                                render={({ field }) => (
                                    <FormItem className="w-full md:w-24">
                                        <FormLabel className="sr-only">Quantity for product {index + 1}</FormLabel>
                                        <FormControl>
                                            {/* Ensure step="1" for integer input */}
                                            <Input type="number" min="1" step="1" placeholder="Qty" {...field} onChange={event => field.onChange(+event.target.value)} />
                                        </FormControl>
                                        {/* Show stock level dynamically */}
                                        <FormMessage />
                                        {/* Optionally display available stock next to quantity input */}
                                         <p className="text-xs text-muted-foreground mt-1">Avail: {stockLevel}</p>
                                    </FormItem>
                                )}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 h-9 w-9 mt-1 md:mt-0 self-end md:self-center"
                                onClick={() => remove(index)}
                                disabled={fields.length <= 1}
                                aria-label={`Remove product ${index + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ productId: '', units: 1 })}
                    className="mt-2 border-dashed"
                >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Product
                </Button>
                 {/* Display top-level error message for the products array (e.g., min length, duplicates) */}
                 {form.formState.errors.products?.root && <FormMessage>{form.formState.errors.products.root.message}</FormMessage>}
                 {form.formState.errors.products?.message && <FormMessage>{form.formState.errors.products.message}</FormMessage>}

            </CardContent>
        </Card>


        <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
                Create Shipment
            </Button>
        </div>
      </form>
    </Form>
  );
}
