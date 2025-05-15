import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.HOLDED_API_KEY;
  const apiUrl = 'https://api.holded.com/api/invoicing/v1/products';

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json({ message: 'API key configuration error.' }, { status: 500 });
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json', // Explicitly accept JSON
      },
      // Add cache control if needed, e.g., cache for an hour
      // next: { revalidate: 3600 }
    });

    if (!response.ok) {
      // Log the error response from Holded
      const errorBody = await response.text();
      console.error(`Holded API error: ${response.status} ${response.statusText}`, errorBody);
      return NextResponse.json({ message: `Failed to fetch from Holded API: ${response.statusText}`, details: errorBody }, { status: response.status });
    }

    const data = await response.json();

    // Map Holded product structure to our Product type
    // Assuming 'stock' field exists, otherwise adjust or remove stockLevel
    const products = data.map((item: any) => ({
      id: String(item.id),
      name: item.name || 'Unnamed Product',
      description: item.desc || '',
      price: item.price || 0,
      sku: item.sku || '',
      // IMPORTANT: Adjust 'stock' field based on actual Holded API response
      // If Holded provides stock info under a different key or not at all, update this.
      // Using a default of 0 if 'stock' is missing or undefined.
      stockLevel: typeof item.stock === 'number' ? item.stock : 0,
      // You might need a placeholder image URL logic here
      imageUrl: item.imageUrl || `https://picsum.photos/seed/${item.sku || item.id}/50/50`, // Basic placeholder
    }));

    return NextResponse.json(products);

  } catch (error) {
    console.error('Error in API route fetching from Holded:', error);
    // Check if it's a FetchError or similar
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Failed to fetch products due to an internal error.', error: errorMessage }, { status: 500 });
  }
}

// Removed PUT handler from here as it should be in [productId]/stock/route.ts
