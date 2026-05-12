import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('issuer')
    .description('Skill-driven PM gateway. Structure requirements → breakdown tasks → sync to GitHub/GitLab/Yunxiao.')
    .version('0.2.0');
  return program;
}
