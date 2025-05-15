"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from '@/hooks/use-toast';
import { logisticsCopilotQuestion, LogisticsCopilotOutput } from '@/ai/flows/logistics-copilot';
import { Bot, Loader2, Sparkles, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Product } from '@/lib/types';

const copilotSchema = z.object({
  question: z.string().min(5, { message: "Question must be at least 5 characters." }),
  estimatedDeliveryDate: z.date().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
});
type CopilotFormValues = z.infer<typeof copilotSchema>;

interface LogisticsCopilotWidgetProps {
  products: Product[]; // Add products prop
}

export default function LogisticsCopilotWidget({ products }: LogisticsCopilotWidgetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<LogisticsCopilotOutput | null>(null);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CopilotFormValues>({
    resolver: zodResolver(copilotSchema),
    defaultValues: { 
      question: '',
      estimatedDeliveryDate: undefined,
      origin: '',
      destination: '',
    },
  });

  const onSubmit = async (data: CopilotFormValues) => {
    setIsLoading(true);
    setAiResponse(null);
    try {
      const productInfoForAI = products.map(p => ({ 
        name: p.name, 
        sku: p.sku, 
        stockLevel: p.stockLevel 
      }));

      const response = await logisticsCopilotQuestion({ 
        question: data.question,
        estimatedDeliveryDate: data.estimatedDeliveryDate ? data.estimatedDeliveryDate.toISOString().split('T')[0] : undefined,
        origin: data.origin || undefined,
        destination: data.destination || undefined,
        availableProducts: productInfoForAI.length > 0 ? productInfoForAI : undefined,
      });
      setAiResponse(response);
    } catch (error) {
      console.error("Logistics Copilot Error:", error);
      toast({
        variant: "destructive",
        title: "AI Error",
        description: "Could not get a response from the copilot.",
      });
    }
    setIsLoading(false);
  };

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <CardTitle className="text-xl">Logistics Copilot</CardTitle>
            <CardDescription>Ask about delays, delivery estimates, or material needs.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="copilot-question">Your Question</FormLabel>
                  <FormControl>
                    <Textarea
                      id="copilot-question"
                      placeholder="e.g., Will my shipment to Montmeló be delayed? or What material do I need to send to the Montmeló GP?"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Accordion type="single" collapsible className="w-full" value={isContextOpen ? "item-1" : ""}>
              <AccordionItem value="item-1" className="border-b-0">
                <AccordionTrigger
                  onClick={() => setIsContextOpen(!isContextOpen)}
                  className="text-sm font-medium text-muted-foreground hover:no-underline py-2 flex justify-start items-center gap-1"
                >
                    {isContextOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                     Optional: Add Shipment Context
                </AccordionTrigger>
                <AccordionContent className="pt-4 space-y-4 border-t mt-2">
                  <FormField
                    control={form.control}
                    name="estimatedDeliveryDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Estimated Delivery Date (Optional)</FormLabel>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select estimated date"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="origin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Origin (Optional)</FormLabel>
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
                          <FormLabel>Destination (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Circuit de Monaco" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
             {aiResponse && (
              <Card className="bg-muted/50 p-4 border-primary/20 border">
                <CardHeader className="p-0 pb-2">
                  <CardTitle className="text-md flex items-center"><Sparkles className="h-5 w-5 mr-2 text-primary" /> Copilot's Response</CardTitle>
                </CardHeader>
                <CardContent className="p-0 text-sm space-y-3">
                  <p className="whitespace-pre-wrap">{aiResponse.answer}</p>
                  {aiResponse.includeSuggestedActions && aiResponse.suggestedActions && (
                    <div className="pt-3 mt-3 border-t border-primary/20">
                      <h4 className="font-semibold mb-1 flex items-center"><Lightbulb className="h-4 w-4 mr-2 text-amber-500" />Additional Suggested Actions:</h4>
                      <p className="text-xs whitespace-pre-wrap">{aiResponse.suggestedActions}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin mr-2" /> : <Bot className="mr-2 h-4 w-4" />}
              Ask Copilot
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

    