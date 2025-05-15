
import { NextRequest, NextResponse } from 'next/server';
import { defaultShipmentStatuses } from '@/lib/mock-data'; 
import type { HoldedCustomField } from '@/lib/types';

// Internal representation of status tags (hyphenated)
const ALL_MANAGEABLE_STATUS_TAG_IDS = defaultShipmentStatuses.map(s => s.id); 
// 'order-confirmed' is also managed by the app.
// This list helps the backend identify which tags on a Holded invoice are managed by this application.
const ALL_POSSIBLE_APP_MANAGED_TAGS = [...new Set([...ALL_MANAGEABLE_STATUS_TAG_IDS, 'order-confirmed'])];

// Helper to convert Holded tag format (string or {name: string}) to our internal hyphenated format
function normalizeHoldedTagToInternal(tag: any): string {
    let rawTagValue: string;
    if (typeof tag === 'string') rawTagValue = tag;
    else if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string') rawTagValue = tag.name;
    else return ''; // Invalid tag structure

    const lowerTag = rawTagValue.toLowerCase();
    // Known mappings from observed Holded format (lowercase, no hyphen) to internal format (lowercase, with hyphen if applicable)
    // This is important for consistency when comparing with ALL_POSSIBLE_APP_MANAGED_TAGS
    const knownMappings: { [key: string]: string } = {
        'pendingconfirmation': 'pending-confirmation',
        'orderconfirmed': 'order-confirmed',
        'intransit': 'in-transit',
        'withissue': 'with-issue',
        'delivered': 'delivered',
        'cancelled': 'cancelled',
    };
    
    if (knownMappings[lowerTag]) {
        return knownMappings[lowerTag];
    }
    // General fallback for other tags (like 'sensor') or if already hyphenated (though Holded seems to avoid hyphens in names)
    return lowerTag.replace(/\s+/g, '-');
}

// Helper to convert internal hyphenated tag format to Holded's expected format (lowercase, no hyphen for status tags)
function convertInternalTagToHoldedFormat(internalTag: string): string {
    const lowerInternalTag = internalTag.toLowerCase();
    // For status tags and 'order-confirmed' (which are in ALL_POSSIBLE_APP_MANAGED_TAGS in hyphenated form),
    // Holded often expects them without hyphens (e.g., 'pendingconfirmation').
    // Other tags (like 'sensor') should pass through as lowercase.
    const isAppManaged = ALL_POSSIBLE_APP_MANAGED_TAGS.includes(lowerInternalTag);
    
    if (isAppManaged) {
        return lowerInternalTag.replace(/-/g, ''); // Remove hyphens for app-managed tags
    }
    return lowerInternalTag; // For non-status tags like 'sensor', keep as is (lowercase)
}


interface UpdateHoldedInvoicePayload {
  tags?: string[]; // Expected from client in internal, hyphenated format
  notes?: string;
  customFields?: HoldedCustomField[]; 
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

    // Normalize existing tags from Holded to our internal (hyphenated) format
    const existingTagsInternalFormat: string[] = existingRawTags
      .map(normalizeHoldedTagToInternal)
      .filter(Boolean); // Remove any empty strings from invalid tags

    // Identify non-app-managed tags from Holded to preserve them (e.g., "sensor")
    // These are tags found on Holded that are NOT in our ALL_POSSIBLE_APP_MANAGED_TAGS list.
    const otherNonStatusTagsToPreserveInternalFormat = existingTagsInternalFormat.filter(
      tag => !ALL_POSSIBLE_APP_MANAGED_TAGS.includes(tag) 
    );
    
    // New app-managed tags from the client (expected to be in internal hyphenated format)
    // This list represents the COMPLETE desired set of app-managed tags for the new state.
    const newAppManagedTagsFromClientInternalFormat = (bodyFromClient.tags || [])
      .map(tag => tag.toLowerCase().replace(/\s+/g, '-')); // Ensure client tags are consistently internal format

    // Combine the preserved non-status tags with the new app-managed tags from the client.
    // This ensures other tags like "sensor" are kept, and app-managed tags are fully replaced by client's list.
    const combinedTagsInternalFormat = [...new Set([...otherNonStatusTagsToPreserveInternalFormat, ...newAppManagedTagsFromClientInternalFormat])];
    
    // Convert final combined list of tags to Holded's expected format (e.g., lowercase, no hyphens for status tags) before sending
    const finalTagsForHoldedPayload = combinedTagsInternalFormat.map(convertInternalTagToHoldedFormat);
    
    const payloadForHolded: Partial<UpdateHoldedInvoicePayload> = {};
    
    // Only include 'tags' in payload if client intended to update them (i.e., sent a `tags` array, even if empty)
    if (bodyFromClient.tags !== undefined) {
        payloadForHolded.tags = finalTagsForHoldedPayload;
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
    
    console.log(`Updating Holded invoice ${invoiceId}.`);
    console.log(`  Existing tags on Holded (normalized internal fmt): ${existingTagsInternalFormat.join(', ')}`);
    console.log(`  Non-app-managed tags to preserve (internal fmt): ${otherNonStatusTagsToPreserveInternalFormat.join(', ')}`);
    console.log(`  New app-managed tags from client (internal fmt): ${newAppManagedTagsFromClientInternalFormat.join(', ')}`);
    console.log(`  Final combined tags to send to Holded (Holded fmt): ${finalTagsForHoldedPayload.join(', ')}`);


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

