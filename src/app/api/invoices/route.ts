
import { NextRequest, NextResponse } from 'next/server';
import type { Shipment, ShipmentStatus, ShipmentProduct, HoldedCustomField } from '@/lib/types';
import { format, parseISO, isValid } from 'date-fns';

interface HoldedInvoiceItem {
  name: string;
  units: number;
  price: number;
  tax: string; 
  sku?: string;
  desc?: string;
}

interface RetrievedHoldedInvoiceProduct {
  name: string;
  desc?: string;
  price: number;
  units: number; 
  projectid?: string | null;
  tax?: number;
  taxes?: string[];
  tags?: string[];
  discount?: number;
  retention?: number;
  weight?: number;
  costPrice?: number;
  sku?: string;
  account?: string;
  productId: string; 
  variantId?: string;
}

interface CreateHoldedInvoicePayload {
  contactId: string;
  items: HoldedInvoiceItem[];
  desc?: string;
  date?: number; 
  tags?: string[]; 
  notes?: string; 
  customFields?: HoldedCustomField[]; 
}

function parseShipmentNotes(notes: string | undefined): Partial<Shipment> {
  const parsed: Partial<Shipment> = {};
  if (!notes) return parsed;

  const lines = notes.split('\n');
  lines.forEach(line => {
    const [key, ...valueParts] = line.split(': ');
    const value = valueParts.join(': ').trim();

    if (key === 'Shipment Title') parsed.title = value;
    else if (key === 'Origin') parsed.origin = value;
    else if (key === 'Destination') parsed.destination = value;
    else if (key === 'Est. Delivery') {
      let dateObj;
      // value is YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { 
        dateObj = parseISO(value + "T00:00:00.000Z"); // Parse as UTC midnight
      } else {
         // Fallback for other potential date formats, treat as local if no TZ
         dateObj = new Date(value); 
      }
      if (isValid(dateObj)) parsed.estimatedDelivery = dateObj.toISOString();
    }
    else if (key === 'Actual Delivery') {
      // Value is expected to be an ISO string (UTC)
      const dateObj = parseISO(value);
      if (isValid(dateObj)) parsed.actualDelivery = dateObj.toISOString();
    }
    else if (key === 'Issue') parsed.issueDescription = value;
    else if (key === 'Internal Shipment ID') parsed.id = value;
    else if (key === 'Order Confirmed') parsed.isOrderConfirmed = value.toLowerCase() === 'true';
  });
  return parsed;
}


export async function GET(request: NextRequest) {
  const apiKey = process.env.HOLDED_API_KEY;
  const holdedInvoicesUrl = 'https://api.holded.com/api/invoicing/v1/documents/invoice';

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json({ message: 'API key configuration error.' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true'; 

    const fetchParams: Record<string, string> = {};
    if (detailed) {
      // Add parameters if Holded supports more detailed invoice data on list
    }
    
    const urlWithParams = new URL(holdedInvoicesUrl);
    Object.entries(fetchParams).forEach(([key, value]) => urlWithParams.searchParams.append(key, value));

    const response = await fetch(urlWithParams.toString(), {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Accept': 'application/json',
      },
      cache: 'no-store', 
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      console.error(`Holded API error (List Invoices): ${response.status} ${response.statusText}`, errorBodyText);
      let errorDetails: any = { message: errorBodyText };
      try { errorDetails = JSON.parse(errorBodyText); } catch (e) { /* Keep text if not JSON */ }
      return NextResponse.json({ 
          message: `Failed to fetch invoices from Holded: ${errorDetails.info || errorDetails.message || response.statusText}`, 
          details: errorDetails 
      }, { status: response.status });
    }

    const holdedInvoices: any[] = await response.json();
    
    const shipments: Shipment[] = holdedInvoices.map((inv: any) => {
      const notesData = parseShipmentNotes(inv.notes);
      const customFields: HoldedCustomField[] = inv.customFields || [];
      
      const shipmentIdField = customFields.find(cf => cf.field === 'shipment_id');
      let shipmentId = shipmentIdField ? shipmentIdField.value : notesData.id;

      let title = notesData.title;
      if (!title && inv.desc) {
        const descMatch = inv.desc.match(/Invoice for Shipment: ([^(]+)(?:\s\(TrackPulse ID: ([^)]+)\))?/);
        if (descMatch && descMatch[1]) {
          title = descMatch[1].trim();
          if (!shipmentId && descMatch[2]) {
             shipmentId = `shp_${descMatch[2]}`; 
          }
        }
      }
      if (!title) title = `Shipment for Invoice ${inv.docNumber || inv.id}`;
      if (!shipmentId) shipmentId = `inv_${inv.id}`; // Fallback shipment ID

      const invTagsRaw: any[] = inv.tags || [];
      const invTags: string[] = invTagsRaw.map(tag => {
          let normalizedTag = '';
          if (typeof tag === 'string') normalizedTag = tag;
          else if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string') normalizedTag = tag.name;
          return normalizedTag.toLowerCase().replace(/\s+/g, '-');
      }).filter(Boolean);

      const tagToInternalStatusMap: { [key: string]: ShipmentStatus | 'order-confirmed' } = {
        'pendingconfirmation': 'pending-confirmation',
        'orderconfirmed': 'order-confirmed',
        'withissue': 'with-issue',
        'intransit': 'in-transit',
        'delivered': 'delivered',
        'cancelled': 'cancelled',
      };
      const normalizedInvTags = invTags.map(tag => tagToInternalStatusMap[tag.replace(/-/g, '')] || tag); // Normalize from Holded (no hyphen) to internal
      
      let statusTag: ShipmentStatus = 'pending-confirmation'; 
      const statusPriority: ShipmentStatus[] = ['with-issue', 'cancelled', 'delivered', 'in-transit', 'pending-confirmation'];
      
      for (const prioritizedStatus of statusPriority) {
        if (normalizedInvTags.includes(prioritizedStatus)) {
          statusTag = prioritizedStatus;
          break; 
        }
      }
      
      const isOrderConfirmedFromTag = normalizedInvTags.includes('order-confirmed');
      const isOrderConfirmedFromNotes = notesData.isOrderConfirmed || false;

      const products: ShipmentProduct[] = (inv.products || []).map((item: RetrievedHoldedInvoiceProduct): ShipmentProduct => ({
        productId: item.productId || item.sku || `unknown_pid_for_${item.name.replace(/\s+/g, '_')}`,
        units: item.units,      
      }));
      
      const estDeliveryDate = notesData.estimatedDelivery || (inv.date ? new Date(inv.date * 1000).toISOString() : new Date().toISOString());
      const createdAtDate = inv.date ? new Date(inv.date * 1000).toISOString() : new Date().toISOString();

      return {
        id: shipmentId!,
        title: title!,
        status: statusTag,
        products: products,
        estimatedDelivery: estDeliveryDate,
        actualDelivery: notesData.actualDelivery,
        issueDescription: notesData.issueDescription, 
        origin: notesData.origin || 'N/A',
        destination: notesData.destination || 'N/A',
        isOrderConfirmed: isOrderConfirmedFromTag || isOrderConfirmedFromNotes, 
        createdAt: createdAtDate,
        holdedInvoiceId: inv.id,
        tags: invTags, // Store the raw (but normalized) tags from Holded for reference
      };
    }).filter(s => s.id); 

    return NextResponse.json(shipments);

  } catch (error) {
    console.error('Error in API route fetching Holded invoices:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to fetch shipments due to an internal server error.', error: errorMessage }, { status: 500 });
  }
}


export async function POST(request: NextRequest) {
  const apiKey = process.env.HOLDED_API_KEY;
  const holdedInvoiceUrl = 'https://api.holded.com/api/invoicing/v1/documents/invoice';

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json({ message: 'API key configuration error.' }, { status: 500 });
  }

  try {
    const body: CreateHoldedInvoicePayload = await request.json();

    if (!body.contactId || !body.items || body.items.length === 0) {
      return NextResponse.json({ message: 'Missing contactId or items for invoice.' }, { status: 400 });
    }

    for (const item of body.items) {
        if (item.name === undefined || typeof item.units !== 'number' || item.units <= 0 || typeof item.price !== 'number' || item.tax === undefined) {
            return NextResponse.json({ message: `Invalid item data: ${JSON.stringify(item)}. Ensure name, quantity (>0), price, and tax are provided.` }, { status: 400 });
        }
    }

    const creationDateTimestamp = body.date || Math.floor(Date.now() / 1000); // Use provided or current timestamp

    const customFieldsForHolded: HoldedCustomField[] = [];
    if (body.customFields) {
      if (!Array.isArray(body.customFields) || body.customFields.some(cf => typeof cf.field !== 'string' || typeof cf.value !== 'string')) {
        return NextResponse.json({ message: 'Invalid customFields format. Must be an array of {field: string, value: string}.' }, { status: 400 });
      }
      customFieldsForHolded.push(...body.customFields);
    }

    if (body.tags) {
      if (!Array.isArray(body.tags) || body.tags.some(tag => typeof tag !== 'string')) {
        return NextResponse.json({ message: 'Invalid tags format. Must be an array of strings.' }, { status: 400 });
      }
    }

    const payloadForHolded = {
        ...body,
        date: creationDateTimestamp,
        customFields: customFieldsForHolded, 
        tags: body.tags || ['pending-confirmation'], // Default tag
    };

    console.log("Payload sent to Holded for invoice creation:", JSON.stringify(payloadForHolded, null, 2));

    const response = await fetch(holdedInvoiceUrl, {
      method: 'POST',
      headers: {
        'key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payloadForHolded),
    });

    const responseText = await response.text();
    console.log(`Holded API response (Create Invoice): Status ${response.status}, Body: ${responseText.substring(0, 500)}...`);

    let invoiceData;
    try {
        invoiceData = JSON.parse(responseText);
    } catch (e) {
        console.error("Failed to parse Holded response as JSON. Body:", responseText);
        return NextResponse.json({ message: `Invoice creation request sent, but Holded response was not valid JSON. Status ${response.status}. Body: ${responseText.substring(0,200)}...` }, { status: response.ok ? 502 : response.status });
    }

    if (!response.ok) {
      console.error(`Holded API error (Create Invoice): ${response.status} ${response.statusText}`);
      return NextResponse.json({ message: `Failed to create invoice in Holded: ${invoiceData.info || invoiceData.message || response.statusText}`, details: invoiceData }, { status: response.status });
    }
    
    // Ensure 'date' is present in the response from Holded, or use what we sent
    const responsePayload = invoiceData.data || invoiceData;
    if (typeof responsePayload.date !== 'number') {
        responsePayload.date = creationDateTimestamp;
    }


    if (!responsePayload || typeof responsePayload.id !== 'string' || (responsePayload.status !== undefined && responsePayload.status !== 1)) {
      console.error("Holded invoice creation response is missing expected fields or status != 1:", responsePayload);
      return NextResponse.json({ 
        message: `Holded processed the request, but the response was incomplete or indicated an issue.`,
        details: responsePayload
      }, { status: 502 });
    }

    return NextResponse.json({ message: 'Invoice created successfully in Holded.', data: responsePayload }, { status: 201 });

  } catch (error) {
    console.error('Error in API route creating Holded invoice:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to create invoice due to an internal server error.', error: errorMessage }, { status: 500 });
  }
}

