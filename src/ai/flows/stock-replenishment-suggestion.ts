// Stock replenishment suggestion flow.

'use server';

/**
 * @fileOverview A stock replenishment suggestion AI agent.
 *
 * - stockReplenishmentSuggestion - A function that handles the stock replenishment suggestion process.
 * - StockReplenishmentSuggestionInput - The input type for the stockReplenishmentSuggestion function.
 * - StockReplenishmentSuggestionOutput - The return type for the stockReplenishmentSuggestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const StockReplenishmentSuggestionInputSchema = z.object({
  materialNeedsQuestion: z
    .string()
    .describe("The logistics manager's question about material needs."),
});
export type StockReplenishmentSuggestionInput = z.infer<
  typeof StockReplenishmentSuggestionInputSchema
>;

const StockReplenishmentSuggestionOutputSchema = z.object({
  suggestedActions: z.string().describe('Suggested automated stock replenishment actions.'),
  includeSuggestedActions: z
    .boolean()
    .describe(
      'A boolean value indicating whether suggested actions should be incorporated based on the material needs question.'
    ),
});
export type StockReplenishmentSuggestionOutput = z.infer<
  typeof StockReplenishmentSuggestionOutputSchema
>;

export async function stockReplenishmentSuggestion(
  input: StockReplenishmentSuggestionInput
): Promise<StockReplenishmentSuggestionOutput> {
  return stockReplenishmentSuggestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'stockReplenishmentSuggestionPrompt',
  input: {schema: StockReplenishmentSuggestionInputSchema},
  output: {schema: StockReplenishmentSuggestionOutputSchema},
  prompt: `You are an expert logistics manager. Based on the material needs question, suggest automated stock replenishment actions and determine whether these suggested actions should be incorporated.

Material Needs Question: {{{materialNeedsQuestion}}}
`,
  tools: [
    {
      name: 'determineIfSuggestedActionsShouldBeIncorporated',
      description:
        'This tool determines if suggested actions should be incorporated based on the material needs question.',
      inputSchema: z.object({
        question: z
          .string()
          .describe('The material needs question from the logistics manager.'),
      }),
      outputSchema: z.boolean(),
    },
  ],
});

const stockReplenishmentSuggestionFlow = ai.defineFlow(
  {
    name: 'stockReplenishmentSuggestionFlow',
    inputSchema: StockReplenishmentSuggestionInputSchema,
    outputSchema: StockReplenishmentSuggestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
