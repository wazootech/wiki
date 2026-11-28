#!/usr/bin/env node
import { main } from "../dist/cli.js";

// Set the code and let the event loop drain. `process.exit` would drop output
// still queued on a pipe, and aborts Node on Windows if a handle is closing.
process.exitCode = await main();
