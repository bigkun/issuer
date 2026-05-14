import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('issuer')
    .description('Skill-driven PM gateway. Breakdown requirements → sync to any platform via MCP. Built-in: GitHub, GitLab, Yunxiao, PingCode.')
    .version('0.2.0');
  return program;
}
