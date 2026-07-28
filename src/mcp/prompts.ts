import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const registerPrompts = (server: McpServer): void => {
  server.prompt(
    'migrate-css-tokens',
    'Extract design tokens from existing CSS/SCSS files and generate a W3C DTCG token file',
    {
      path: z.string().describe('Directory or file to scan'),
      formats: z.string().optional().default('css,js').describe('Output formats to generate after migration'),
    },
    ({ path, formats }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I want to migrate my existing CSS custom properties to Toki design tokens.

Steps:
1. Call \`extract_tokens\` with path "${path}" and output mode "raw" to scan for CSS/SCSS token candidates.
2. Review the extracted tokens and organize them into a proper W3C DTCG structure:
   - Group by category (color, spacing, typography, etc.)
   - Assign proper $type to each token based on value patterns
   - Name tokens using kebab-case paths (e.g., color.brand.primary)
   - Identify repeated values that should become references ({group.token})
3. Write the organized tokens to a \`tokens.json\` file.
4. Call \`parse_tokens\` to validate the new file.
5. Call \`build_tokens\` with formats [${formats}] to generate the output artifacts.
6. Show me a summary of what was extracted, how tokens were organized, and what was generated.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    'validate-tokens',
    'Parse a token file, check for quality issues, and produce an audit report',
    {
      input: z.string().describe('Path to the token file'),
    },
    ({ input }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Audit my design token file for quality issues.

Steps:
1. Call \`parse_tokens\` with input "${input}" to validate structure.
2. Call \`resolve_tokens\` with input "${input}" to expand all references.
3. Analyze the results and report:
   - Total token count by type (color, dimension, etc.)
   - Any orphaned tokens (not referenced by any other token)
   - Naming consistency (are all tokens following kebab-case?)
   - Tokens with missing $description
   - Potential duplicates (same value, different names)
   - Reference chains deeper than 2 levels
4. If issues are found, suggest specific fixes.
5. Call \`list_formats\` to remind me which output formats are available.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    'preview-all-formats',
    'Generate and compare token output across all supported platform formats',
    {
      input: z.string().describe('Path to the token file'),
      formats: z.string().optional().default('css,js,react').describe('Comma-separated formats to preview'),
    },
    ({ input, formats }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Show me what my design tokens look like across different platform outputs.

Steps:
1. Call \`parse_tokens\` with input "${input}" to confirm the file is valid.
2. For each format in [${formats}], call \`preview_format\` with that format.
3. Present each output in a code block labeled with the platform name.
4. After showing all outputs, highlight:
   - Key differences between platforms (naming conventions, value transforms)
   - Any tokens that were skipped in certain formats (e.g., composites in CSS)
   - Which platforms I might want to generate for my project
5. Offer to call \`build_tokens\` for any format I want to generate permanently.`,
          },
        },
      ],
    }),
  );
};
