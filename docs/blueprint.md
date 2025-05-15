# **App Name**: TrackPulse

## Core Features:

- Shipment Overview Dashboard: Display planned shipments, their current status (pending, in transit, delivered, with issue), and key indicator summaries like daily shipments, failed deliveries, average delivery time, and stock level per product.
- Shipment Card: Visualize each shipment as an editable card, displaying included products and providing options to print the document, confirm receipt from the track, or report an issue.
- Logistics Copilot: An intelligent assistant that responds to questions like 'What material do I need to send to the Montmeló GP?' and suggests actions like automated stock replenishment. The assistant uses a tool to determine if it should incorporate suggested actions.
- User Authentication: Allow personnel to log in to the application using basic authentication (email and password or temporary key).
- Responsive Views: Provide distinct, responsive views tailored for logistics teams (focused on stock management) and track teams (focused on receipt confirmation and issue reporting).
- Holded API Integration: Access the Holded API to retrieve product information, using API key: 8030ab5fa15466793a8b5ac505c18eee.

## Style Guidelines:

- Use a clean, professional blue (#2E9AFE) for the primary interface elements to convey trust and efficiency.
- Implement a light gray (#F5F5F5) for backgrounds to ensure content legibility and reduce visual noise.
- Use green (#4CAF50) for success states like 'delivered' and red (#F44336) for error/issue states.
- Implement a card-based layout for shipments, using clear sections for products, status, and actions.
- Use consistent and recognizable icons from a standard library (e.g., Material Design Icons) for shipment statuses, actions, and categories.
- Incorporate subtle transitions and loading animations to provide feedback during data fetching and updates.