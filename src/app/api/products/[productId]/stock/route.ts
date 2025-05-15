import { NextRequest, NextResponse } from 'next/server';

// PUT /api/products/[productId]/stock
// Updates the stock level for a specific product in Holded by applying a delta.
export async function PUT(request: NextRequest, { params }: { params: { productId: string } }) {
  const { productId } = params;
  const apiKey = process.env.HOLDED_API_KEY;
  const holdedBaseUrl = 'https://api.holded.com/api';
  const holdedProductStockUrl = `${holdedBaseUrl}/invoicing/v1/products/${productId}/stock`;
  const holdedProductUrl = `${holdedBaseUrl}/invoicing/v1/products/${productId}`; // To get warehouseId

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json({ message: 'API key configuration error.' }, { status: 500 });
  }

  let quantityDelta: number;
  try {
    const body = await request.json();
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity)) {
      return NextResponse.json({ message: 'Invalid quantity delta provided. Must be an integer.' }, { status: 400 });
    }
    quantityDelta = body.quantity; // This is the change (+ve or -ve)
    console.log(`Received request to update stock for ${productId} by ${quantityDelta}`);
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return NextResponse.json({ message: 'Invalid request body. Could not parse JSON.' }, { status: 400 });
  }

  try {
    // Step 1: Get current product data from Holded to find the warehouseId
    console.log(`Fetching current data for product ${productId} to get warehouseId.`);
    const getProductResponse = await fetch(holdedProductUrl, {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!getProductResponse.ok) {
      const errorBody = await getProductResponse.text();
      console.error(`Holded API error (GET product details): ${getProductResponse.status} ${getProductResponse.statusText}`, errorBody);
      if (getProductResponse.status === 404) {
        return NextResponse.json({ message: `Product with ID ${productId} not found in Holded.` }, { status: 404 });
      }
      return NextResponse.json({ message: `Failed to fetch product details from Holded API: ${getProductResponse.statusText}`, details: errorBody }, { status: getProductResponse.status });
    }

    const productData = await getProductResponse.json();
    // Attempt to find a default warehouseId. Holded API might store this in various ways.
    // Common patterns: 'warehouseId', 'defaults.warehouseId', or checking stock movements/warehouses array.
    // Adjust this logic based on your Holded setup and API response structure.
    const warehouseId = productData.warehouseId || productData.defaults?.warehouseId;

    if (!warehouseId) {
      console.error(`Could not determine warehouseId for product ${productId}. Product data:`, productData);
      return NextResponse.json({ message: `Warehouse ID not found for product ${productId}. Cannot update stock without it.` }, { status: 400 });
    }
    console.log(`Using warehouseId: ${warehouseId} for product ${productId}`);


    // Step 2: Build the payload for the /stock endpoint
    // The payload requires the warehouse ID and the *delta* (change) for the product.
    const payload = {
      stock: {
        [warehouseId]: {
          [productId]: quantityDelta, // Use the delta here
        },
      },
    };
    console.log(`Attempting to update stock for product ${productId} in warehouse ${warehouseId} by ${quantityDelta}. Sending payload:`, JSON.stringify(payload));


    // Step 3: PUT the stock adjustment payload to the specific Holded endpoint
    const putStockResponse = await fetch(holdedProductStockUrl, {
      method: 'PUT',
      headers: {
        'key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!putStockResponse.ok) {
      const errorBody = await putStockResponse.text();
      console.error(`Holded API error (PUT stock): ${putStockResponse.status} ${putStockResponse.statusText}`, errorBody);
       // Try parsing the error body as JSON for more details
      let errorDetails = {};
      try {
        errorDetails = JSON.parse(errorBody);
      } catch (parseError) {
        errorDetails = { rawError: errorBody }; // Fallback to raw text
      }
      return NextResponse.json({ message: `Failed to update product stock in Holded API: ${putStockResponse.statusText}`, details: errorDetails }, { status: putStockResponse.status });
    }

    // Holded PUT to /stock usually returns 200 OK with updated info or 204 No Content.
    // Assuming 2xx means success.
    console.log(`Successfully updated stock for product ${productId} by ${quantityDelta} in Holded.`);
    // Optionally parse and return the response from Holded if needed
    // const responseData = await putStockResponse.json(); // If response has body
    return NextResponse.json({ message: 'Stock updated successfully in Holded.' /*, data: responseData */ });

  } catch (error) {
    console.error(`Error in API route updating Holded stock for product ${productId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to update stock due to an internal server error.', error: errorMessage }, { status: 500 });
  }
}
