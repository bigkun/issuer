import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('issuer')
    .description('Skill-driven PM gateway for GitHub Issues.')
    .version('0.1.0');
  return program;
}
