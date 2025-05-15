import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  const { invoiceId } = await params;
  const apiKey = process.env.HOLDED_API_KEY;

  // The Holded API endpoint for getting a PDF of a document takes docType and documentId.
  // For invoices, docType is 'invoice'.
  const docType = 'invoice';
  const holdedPdfUrl = `https://api.holded.com/api/invoicing/v1/documents/${docType}/${invoiceId}/pdf`;

  if (!apiKey) {
    console.error("HOLDED_API_KEY environment variable is not set.");
    return NextResponse.json(
      { message: 'API key configuration error.' },
      { status: 500 }
    );
  }

  if (!invoiceId) {
    return NextResponse.json(
      { message: 'Invoice ID is required.' },
      { status: 400 }
    );
  }

  try {
    console.log(
      `Fetching PDF for Holded document. Type: ${docType}, ID: ${invoiceId} from ${holdedPdfUrl}`
    );
    const response = await fetch(holdedPdfUrl, {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Accept': 'application/pdf, application/json',
      },
    });

    const contentType = response.headers.get('content-type');

    if (response.ok) {
      if (contentType?.includes('application/pdf')) {
        console.log(`Received direct PDF for ${docType} ${invoiceId}.`);
        const pdfBuffer = await response.arrayBuffer();
        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${docType}-${invoiceId}.pdf"`,
          },
        });
      }

      // Si viene JSON (base64 o error)
      const text = await response.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        // No es JSON válido
        console.warn(
          `Holded API: contenido inesperado con tipo ${contentType}.`
        );
        return NextResponse.json(
          {
            message: `Holded devolvió un tipo de respuesta inesperado: ${contentType}`,
            details: text,
          },
          { status: 502 }
        );
      }

      // JSON válido
      if (json.status === 1 && typeof json.data === 'string') {
        console.log(
          `Decodificando base64 para ${docType} ${invoiceId} desde JSON.`
        );
        const pdfBuffer = Buffer.from(json.data, 'base64');
        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${docType}-${invoiceId}.pdf"`,
          },
        });
      } else {
        const errorMsg =
          json.info || json.message || json.error || `status ${json.status}`;
        console.error(
          `Error en JSON de Holded (Get PDF ${docType} ${invoiceId}):`,
          json
        );
        return NextResponse.json(
          {
            message: `Error al procesar PDF de Holded: ${errorMsg}`,
            details: json,
          },
          { status: 502 }
        );
      }
    } else {
      // Manejo de códigos de error HTTP
      const errorText = await response.text();
      let details: any = errorText;
      try {
        details = JSON.parse(errorText);
      } catch {}
      console.error(
        `Holded API error (${response.status}):`,
        details
      );
      const msg =
        (details.info || details.message || details.error) ??
        response.statusText;
      return NextResponse.json(
        { message: `Error al obtener PDF de Holded: ${msg}`, details },
        { status: response.status }
      );
    }
  } catch (err: any) {
    console.error(`Error interno al obtener PDF ${docType} ${invoiceId}:`, err);
    return NextResponse.json(
      {
        message: 'Error interno al obtener el PDF.',
        error: err.message ?? String(err),
      },
      { status: 500 }
    );
  }
}