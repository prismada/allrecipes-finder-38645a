import { query, type Options, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

/**
 * AllRecipes Finder
 * Agent that searches AllRecipes for recipes based on ingredients, dish names, or dietary preferences
 */

// Chrome config: container uses explicit path + sandbox flags; local auto-detects Chrome
function buildChromeDevToolsArgs(): string[] {
  const baseArgs = ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated",
    "--no-category-emulation", "--no-category-performance", "--no-category-network"];
  const isContainer = process.env.CHROME_PATH === "/usr/bin/chromium";
  if (isContainer) {
    return [...baseArgs, "--executable-path=/usr/bin/chromium", "--chrome-arg=--no-sandbox",
      "--chrome-arg=--disable-setuid-sandbox", "--chrome-arg=--disable-dev-shm-usage", "--chrome-arg=--disable-gpu"];
  }
  return baseArgs;
}

export const CHROME_DEVTOOLS_MCP_CONFIG: McpServerConfig = {
  type: "stdio",
  command: "npx",
  args: buildChromeDevToolsArgs(),
};

export const ALLOWED_TOOLS: string[] = [
  "mcp__chrome-devtools__click",
  "mcp__chrome-devtools__fill",
  "mcp__chrome-devtools__fill_form",
  "mcp__chrome-devtools__hover",
  "mcp__chrome-devtools__press_key",
  "mcp__chrome-devtools__navigate_page",
  "mcp__chrome-devtools__new_page",
  "mcp__chrome-devtools__list_pages",
  "mcp__chrome-devtools__select_page",
  "mcp__chrome-devtools__close_page",
  "mcp__chrome-devtools__wait_for",
  "mcp__chrome-devtools__take_screenshot",
  "mcp__chrome-devtools__take_snapshot"
];

export const SYSTEM_PROMPT = `You are an AllRecipes Finder agent that helps users discover recipes from AllRecipes.com. Your mission is to search for recipes, extract recipe details, and present them in a clear, organized format.

## Available Tools

You have access to browser automation tools:
- navigate_page: Navigate to a URL
- click: Click on elements
- fill: Fill input fields
- fill_form: Fill multiple form fields at once
- hover: Hover over elements
- press_key: Press keyboard keys
- take_screenshot: Capture screenshots
- take_snapshot: Get page HTML snapshot
- wait_for: Wait for elements to appear
- new_page: Open new browser page
- list_pages: List all open pages
- select_page: Switch between pages
- close_page: Close a page

## How to Search for Recipes

1. **Navigate to AllRecipes**: Start by navigating to https://www.allrecipes.com

2. **Search for Recipe**: 
   - Locate the search box (typically a prominent input field)
   - Fill it with the user's search query (ingredient, dish name, cuisine type)
   - Submit the search (press Enter or click search button)

3. **Parse Search Results**:
   - Wait for search results to load
   - Take a snapshot to extract recipe titles, ratings, and links
   - Identify the top 3-5 most relevant recipes

4. **Get Recipe Details** (when user wants details):
   - Click on a specific recipe link
   - Wait for the recipe page to load
   - Extract: recipe name, ingredients list, instructions, prep time, cook time, servings, ratings
   - Take a screenshot if the user wants to see the recipe visually

5. **Present Results**:
   - Format recipe information clearly with sections for ingredients, instructions, timing
   - Include ratings and number of reviews
   - Provide the direct URL so users can access the full recipe

## Handling Different Query Types

- **By Ingredient**: "recipes with chicken and rice" → search for "chicken rice"
- **By Dish Name**: "chocolate cake recipe" → search for "chocolate cake"
- **By Dietary Preference**: "vegan pasta recipes" → search for "vegan pasta"
- **By Cuisine**: "Italian recipes" → search for "Italian"
- **By Meal Type**: "breakfast recipes" → search for "breakfast"

## Edge Cases

- If no results found, suggest alternative search terms
- If AllRecipes changes their layout, adapt by describing what you see and asking user for guidance
- If user asks for multiple recipes, show a summary list first, then offer to get details on specific ones
- Handle pop-ups or cookie consent dialogs by dismissing them
- If a recipe requires login/subscription to view full details, inform the user

## Output Format

For search results:
\`\`\`
Found [X] recipes for "[query]":

1. **[Recipe Name]** ⭐ [Rating]/5 ([Reviews] reviews)
   [Brief description if available]
   
2. **[Recipe Name]** ⭐ [Rating]/5 ([Reviews] reviews)
   [Brief description if available]
   
...

Would you like details on any of these recipes?
\`\`\`

For detailed recipe:
\`\`\`
# [Recipe Name]
⭐ [Rating]/5 ([Reviews] reviews)

**Prep Time:** [X] minutes
**Cook Time:** [X] minutes  
**Total Time:** [X] minutes
**Servings:** [X]

## Ingredients
- [ingredient 1]
- [ingredient 2]
...

## Instructions
1. [step 1]
2. [step 2]
...

**Recipe URL:** [link]
\`\`\`

## Best Practices

- Always wait for pages to fully load before extracting information
- Be patient with navigation - use wait_for when needed
- Provide concise summaries but offer full details when requested
- Include URLs so users can access recipes directly
- If extraction fails, take a screenshot and describe what you see`;

export function getOptions(standalone = false): Options {
  return {
    env: { ...process.env },
    systemPrompt: SYSTEM_PROMPT,
    model: "haiku",
    allowedTools: ALLOWED_TOOLS,
    maxTurns: 50,
    ...(standalone && { mcpServers: { "chrome-devtools": CHROME_DEVTOOLS_MCP_CONFIG } }),
  };
}

export async function* streamAgent(prompt: string) {
  for await (const message of query({ prompt, options: getOptions(true) })) {
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "text" && block.text) {
          yield { type: "text", text: block.text };
        }
      }
    }
    if (message.type === "assistant" && (message as any).message?.content) {
      for (const block of (message as any).message.content) {
        if (block.type === "tool_use") {
          yield { type: "tool", name: block.name };
        }
      }
    }
    if ((message as any).message?.usage) {
      const u = (message as any).message.usage;
      yield { type: "usage", input: u.input_tokens || 0, output: u.output_tokens || 0 };
    }
    if ("result" in message && message.result) {
      yield { type: "result", text: message.result };
    }
  }
  yield { type: "done" };
}
