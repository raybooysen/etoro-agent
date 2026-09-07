#!/usr/bin/env node

import { main } from "./cli.js";
import { EtoroApiError } from "./types/errors.js";

main().catch((err) => {
  if (err instanceof EtoroApiError) {
    console.error(JSON.stringify({
      error: err.message,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      body: err.body,
    }, null, 2));
  } else {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
  process.exit(1);
});
