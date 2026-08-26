/**
 * Entry point kept at the path you already run:
 *
 *   npx tsx Multi-Agents/run-agents.ts [command] [options]
 *
 * With no arguments it runs the full `audit` mission read-only. Every CLI flag
 * documented in `npx tsx Multi-Agents/run-agents.ts help` works here too.
 *
 * ---------------------------------------------------------------------------
 * Note on the original draft this replaces
 * ---------------------------------------------------------------------------
 * The first version called the SDK like this:
 *
 *     const response = await query({ prompt: `...` });
 *     console.log(response);
 *
 * That cannot work. `query()` is not a promise — it returns a `Query`, which is
 * an `AsyncGenerator` of messages. Awaiting it yields the generator object
 * itself, so the agent never runs a single turn and the log prints `{}`. The
 * work only happens while you iterate the stream:
 *
 *     for await (const message of query({ prompt, options })) { ... }
 *
 * The original also had no `options`, which meant no working directory, no tool
 * restrictions, no permission handling, no budget and no result parsing. All of
 * that now lives in `src/runner.ts`.
 * ---------------------------------------------------------------------------
 */

import { main } from './src/cli.js';
import { log } from './src/logger.js';

const argv = process.argv.slice(2);

main(argv.length > 0 ? argv : ['run', 'audit'])
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
