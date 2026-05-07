import { buildProgram } from './cli/program.js';
import { error } from './cli/output.js';

buildProgram()
  .parseAsync(process.argv)
  .catch((e: unknown) => {
    error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
