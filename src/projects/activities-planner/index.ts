import { project } from '@inkeep/agents-sdk';
import { activitiesPlannerAgent } from './agents/activities-planner';
import { friendlyAgent } from './agents/friendly-agent';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';

export const myProject = project({
  id: 'activities-planner',
  name: 'Activities planner',
  description: 'Activities planner project template',
models: {
  'base': {
    'model': 'openai/gpt-5.2'
  },
  'structuredOutput': {
    'model': 'openai/gpt-4.1-mini'
  },
  'summarizer': {
    'model': 'openai/gpt-4.1-nano'
  }
},
  agents: () => [activitiesPlannerAgent, friendlyAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
});
