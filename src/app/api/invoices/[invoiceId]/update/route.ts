
import { NextRequest, NextResponse } from 'next/server';
import { defaultShipmentStatuses } from '@/lib/mock-data'; // To identify status tags
import type { HoldedCustomField } from '@/lib/types';

// Define the list of all manageable status tags.
// These are tags that the application will actively add/remove to reflect shipment status.
const ALL_MANAGEABLE_STATUS_TAG_IDS = defaultShipmentStatuses.map(s => s.id.toLowerCase().replace(/\s+/g, '-'));
// 'order-confirmed' is also a managed tag, but handled separately by the client logic based on isOrderConfirmed state.
// We will add it to the list of tags to be "managed" (i.e., potentially removed if not in new set from client)
// This ensures if client stops sending 'order-confirmed', it's removed.
const ALL_POSSIBLE_APP_MANAGED_TAGS = [...new Set([...ALL_MANAGEABLE_STATUS_TAG_IDS, 'order-confirmed'])];


interface UpdateHoldedInvoicePayload {
  tags?: string[];
  notes?: string;
  customFields?: HoldedCustomField[]; // Allow customFields if ever needed for update
}

export async function PUT(request: NextRequest, { params }: { params: { invoiceId: string } }) {
  const { invoiceId } = params;
  const apiKey = process.env.HOLDED_API_KEY;
  const holdedInvoiceUpdateUrl = `https://api.holded.com/api/invoicing/v1/documents/invoice/${invoiceId}`;
  const holdedInvoiceGetUrl = `https://api.holded.com/api/invoicing/v1/documents/invoice/${invoiceId}`;

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json({ message: 'API key configuration error.' }, { status: 500 });
  }

  if (!invoiceId) {
    return NextResponse.json({ message: 'Invoice ID is required to update.' }, { status: 400 });
  }

  try {
    const bodyFromClient: UpdateHoldedInvoicePayload = await request.json();

    // Fetch the current invoice from Holded to get existing tags
    const getCurrentInvoiceResponse = await fetch(holdedInvoiceGetUrl, {
      method: 'GET',
      headers: { 'key': apiKey, 'Accept': 'application/json' },
    });

    if (!getCurrentInvoiceResponse.ok) {
      const errorBodyText = await getCurrentInvoiceResponse.text();
      console.error(`Holded API error (GET Invoice ${invoiceId} for update): ${getCurrentInvoiceResponse.status} ${getCurrentInvoiceResponse.statusText}`, errorBodyText);
      let errorDetails: any = { message: errorBodyText };
      try { errorDetails = JSON.parse(errorBodyText); } catch (e) { /* Keep text if not JSON */ }
      return NextResponse.json({ 
        message: `Failed to fetch current invoice details from Holded for update: ${errorDetails.info || errorDetails.message || getCurrentInvoiceResponse.statusText}`, 
        details: errorDetails 
      }, { status: getCurrentInvoiceResponse.status });
    }

    const currentInvoiceData = await getCurrentInvoiceResponse.json();
    const existingRawTags: any[] = currentInvoiceData.tags || [];

    // Normalize existing tags to an array of lowercase strings, handling both string and {name: string} formats
    const existingTagsNormalized: string[] = existingRawTags.map(tag => {
        if (typeof tag === 'string') return tag.toLowerCase().replace(/\s+/g, '-');
        if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string') return tag.name.toLowerCase().replace(/\s+/g, '-');
        return ''; // Should not happen with Holded if tags exist
      }).filter(Boolean);

    // Filter out all current app-managed status tags (both old status and 'order-confirmed' if it was there)
    // This leaves only other custom tags (e.g., "sensor")
    const otherNonStatusTagsToPreserve = existingTagsNormalized.filter(
      tag => !ALL_POSSIBLE_APP_MANAGED_TAGS.includes(tag)
    );

    // New status-related tags from the client (e.g., ['in-transit', 'order-confirmed'] or ['delivered'])
    // These are already normalized by the client if they come from ShipmentOverview.
    const newAppManagedTagsFromClient = (bodyFromClient.tags || []).map(tag => tag.toLowerCase().replace(/\s+/g, '-'));

    // Combine the preserved non-status tags with the new app-managed tags from the client
    const finalTagsForHolded = [...new Set([...otherNonStatusTagsToPreserve, ...newAppManagedTagsFromClient])];
    
    const payloadForHolded: Partial<UpdateHoldedInvoicePayload> = {};
    
    // Only include 'tags' in payload if client intended to update them (i.e., sent a `tags` array, even if empty)
    if (bodyFromClient.tags !== undefined) {
        payloadForHolded.tags = finalTagsForHolded;
    }
    // Notes are fully replaced by what client sends.
    if (bodyFromClient.notes !== undefined) {
        payloadForHolded.notes = bodyFromClient.notes;
    }
    // Pass customFields through if client ever sends them for update
    if (bodyFromClient.customFields) {
        payloadForHolded.customFields = bodyFromClient.customFields;
    }

    if (Object.keys(payloadForHolded).length === 0) {
      return NextResponse.json({ message: 'No update data provided (tags or notes).' }, { status: 400 });
    }
    
    console.log(`Updating Holded invoice ${invoiceId}. Current tags: ${existingTagsNormalized.join(', ')}. New app-managed tags from client: ${newAppManagedTagsFromClient.join(', ')}. Final tags to send: ${finalTagsForHolded.join(', ')}`);

    const response = await fetch(holdedInvoiceUpdateUrl, {
      method: 'PUT',
      headers: {
        'key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payloadForHolded),
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      console.error(`Holded API error (Update Invoice ${invoiceId}): ${response.status} ${response.statusText}`, errorBodyText);
      let errorDetails: any = { message: errorBodyText };
      try { errorDetails = JSON.parse(errorBodyText); } catch (e) { /* Keep text if not JSON */ }
      return NextResponse.json({ 
        message: `Failed to update invoice in Holded: ${errorDetails.info || errorDetails.message || response.statusText}`, 
        details: errorDetails 
      }, { status: response.status });
    }

    const updatedInvoiceData = await response.json();
    return NextResponse.json({ message: 'Invoice updated successfully in Holded.', data: updatedInvoiceData }, { status: 200 });

  } catch (error) {
    console.error(`Error in API route updating Holded invoice ${invoiceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to update invoice due to an internal server error.', error: errorMessage }, { status: 500 });
  }
}
