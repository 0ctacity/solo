/**
 * GPUIX Tasks — entry point. See app.tsx for the application itself.
 *
 * Run: bun run build && node dist/index.js
 */

import { render } from "@solo/solid"
import { TasksApp } from "./app.js"

render(() => <TasksApp />, { title: "GPUIX Tasks", width: 480, height: 640 })
