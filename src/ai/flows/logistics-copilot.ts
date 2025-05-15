'use server';
/**
 * @fileOverview Logistics Copilot AI agent.
 *
 * - logisticsCopilotQuestion - A function that answers questions about logistics, predicts delays, estimates delivery times, and suggests actions.
 * - LogisticsCopilotInput - The input type for the logisticsCopilotQuestion function.
 * - LogisticsCopilotOutput - The return type for the logisticsCopilotQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LogisticsCopilotInputSchema = z.object({
  question: z.string().describe('The question about logistics, shipment status, or potential delays.'),
  estimatedDeliveryDate: z.string().optional().describe('The estimated delivery date in ISO format (e.g., YYYY-MM-DD), if known.'),
  origin: z.string().optional().describe('The origin location of the shipment, if relevant to the question.'),
  destination: z.string().optional().describe('The destination location of the shipment, if relevant to the question.'),
  availableProducts: z.array(z.object({
    name: z.string(),
    sku: z.string().optional(),
    stockLevel: z.number().optional(),
  })).optional().describe('List of available products/materials with their names, SKUs, and stock levels, to help in suggesting what materials might be needed.'),
});
export type LogisticsCopilotInput = z.infer<typeof LogisticsCopilotInputSchema>;

const LogisticsCopilotOutputSchema = z.object({
  answer: z.string().describe('The AI-generated answer, focusing on delay predictions, delivery estimations, material suggestions, or other logistics insights based on the input.'),
  suggestedActions: z.string().optional().describe('Suggested non-delay related actions based on the question, such as automated stock replenishment, if applicable.'),
  includeSuggestedActions: z.boolean().describe('Whether or not to incorporate non-delay related suggested actions (like stock replenishment).'),
});
export type LogisticsCopilotOutput = z.infer<typeof LogisticsCopilotOutputSchema>;

export async function logisticsCopilotQuestion(input: LogisticsCopilotInput): Promise<LogisticsCopilotOutput> {
  return logisticsCopilotFlow(input);
}

const shouldIncludeActionsTool = ai.defineTool({
  name: 'shouldIncludeNonDelayActions',
  description: 'Determines whether to include non-delay related suggested actions (e.g., stock replenishment) in the response, separate from delay predictions or direct material answers.',
  inputSchema: z.object({
    question: z.string().describe('The logistics question asked by the user.'),
    shipmentContext: z.object({
        estimatedDeliveryDate: z.string().optional(),
        origin: z.string().optional(),
        destination: z.string().optional(),
    }).optional().describe('Context about the shipment, if provided.'),
    currentAnswer: z.string().describe('The primary answer already formulated regarding delay prediction, delivery estimation, or material needs.'),
    availableProductsContext: z.array(z.object({ name: z.string(), stockLevel: z.number().optional() })).optional().describe('Context about available products and their stock levels.'),
  }),
  outputSchema: z.boolean(),
},
async (input) => {
  // This tool decides if OTHER actions (like stock replenishment) are relevant,
  // especially if the primary answer was about materials and stock is low, or if explicitly asked.
  const question = input.question.toLowerCase();
  if (question.includes('stock') || question.includes('replenish')) {
    return true;
  }
  // If the question was about materials and the answer suggests some, check if stock is low for those.
  // This tool is simplified; a more complex version might involve the LLM passing identified materials.
  if (input.availableProductsContext && (question.includes('material') || question.includes('need'))) {
      // Basic check: if materials were asked and available, replenishment might be relevant.
      return true;
  }
  return false;
});

const prompt = ai.definePrompt({
  name: 'logisticsCopilotPrompt',
  input: {schema: LogisticsCopilotInputSchema},
  output: {schema: LogisticsCopilotOutputSchema},
  tools: [shouldIncludeActionsTool],
  prompt: `You are a logistics expert specializing in predicting shipment delays, providing delivery estimations, and advising on material needs for events based on available stock.

User's question: {{{question}}}

Shipment Context (if provided):
{{#if estimatedDeliveryDate}}Estimated Delivery Date: {{{estimatedDeliveryDate}}}{{/if}}
{{#if origin}}Origin: {{{origin}}}{{/if}}
{{#if destination}}Destination: {{{destination}}}{{/if}}

{{#if availableProducts}}
Available Materials (Product Name, SKU, Current Stock Level):
{{#each availableProducts}}
- {{{this.name}}} (SKU: {{#if this.sku}}{{{this.sku}}}{{else}}N/A{{/if}}, Stock: {{#if this.stockLevel}}{{{this.stockLevel}}}{{else}}N/A{{/if}} units)
{{/each}}
{{/if}}

Based on the user's question, any provided shipment context, and the list of available materials:
1.  Your primary goal is to address the user's question directly.
2.  If the question is about potential delays or delivery times:
    *   Analyze the potential for delays. Consider factors like typical transit times for the route (if origin/destination provided), potential for weather disruptions (general knowledge), historical data patterns (make reasonable assumptions if specific data isn't available in context), and supplier reliability (general knowledge).
    *   If an 'Estimated Delivery Date' is provided, predict any likely delays relative to that date and explain your reasoning clearly.
    *   If no 'Estimated Delivery Date' is provided but the question implies a need for one (e.g., "When will it arrive?", "How long will it take?"), suggest a realistic estimated delivery window or timeline. Explain your reasoning based on available context or typical logistics scenarios.
    *   If the context is insufficient for a precise prediction, state that clearly and explain what additional information would be helpful.
3.  If the question is about material needs (e.g., "What material do I need for Montmeló GP?", "What should I send to Silverstone?"):
    *   Refer to the 'Available Materials' list provided above.
    *   Based on the event/destination (e.g., a Grand Prix like Montmeló or Silverstone) and typical requirements for such motorsport events (general knowledge of racing team needs like tires, fuel, spare parts, tools), suggest relevant materials FROM THE PROVIDED 'Available Materials' LIST.
    *   Consider current stock levels of these items when making suggestions. If you suggest a product from the 'Available Materials' list, include its stock level in your response. For example: "For the Montmeló GP, consider sending Front Wings (Stock: 10 units) and Soft Compound Tyres (Stock: 20 units). Ensure you have enough, as current stock for Front Wings is 10."
    *   If the question is vague and the material list is extensive, provide initial suggestions for common high-demand items for such events. You can also state that for a more complete list, more specific needs could be outlined by the user.
    *   If no 'Available Materials' list is provided in the context, state that you need the list of available products to give a specific recommendation for materials to send.
4.  Formulate your response in the 'answer' field.

After formulating the primary answer:
Consider if any OTHER non-delay/estimation related actions (like stock replenishment recommendations if stock for suggested materials is low) are implied or directly asked in the user's question.
Use the 'shouldIncludeNonDelayActions' tool to determine if these separate actions should be suggested.
If the tool returns true, provide these practical steps or recommendations in the 'suggestedActions' field and set 'includeSuggestedActions' to true. Otherwise, set 'includeSuggestedActions' to false and leave 'suggestedActions' empty.
The 'suggestedActions' should focus on actions like "Consider reordering Product X as stock is low" and should NOT repeat delay/estimation information.
`,
});

const logisticsCopilotFlow = ai.defineFlow(
  {
    name: 'logisticsCopilotFlow',
    inputSchema: LogisticsCopilotInputSchema,
    outputSchema: LogisticsCopilotOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

    
