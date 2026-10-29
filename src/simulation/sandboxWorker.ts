// ---------------------------------------------------------------------------
// Sandbox worker: runs the tuning sandbox formula off the UI thread.
//
// A `while (true)` inside the user's control() would freeze the calculator
// window, so the page terminates this worker after a timeout.
// ---------------------------------------------------------------------------

import { findTask } from '../tasks';
import type { Worksheet } from '../types';
import { runHeadless, type HeadlessResult } from './headless';

export interface SandboxRequest {
  worksheet: Worksheet;
  formula: string;
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<SandboxRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (event: MessageEvent<SandboxRequest>): void => {
  const { worksheet, formula } = event.data;

  const task = findTask(worksheet.taskId);
  if (!task) {
    const result: HeadlessResult = {
      status: 'error',
      time: 0,
      metrics: null,
      pass: false,
      samples: [],
      error: `Unknown task "${worksheet.taskId}".`,
      logs: [],
    };
    ctx.postMessage(result);
    return;
  }

  let result: HeadlessResult;
  try {
    result = runHeadless(task, worksheet, formula);
  } catch (err) {
    result = {
      status: 'error',
      time: 0,
      metrics: null,
      pass: false,
      samples: [],
      error: err instanceof Error ? err.message : String(err),
      logs: [],
    };
  }
  ctx.postMessage(result);
};
