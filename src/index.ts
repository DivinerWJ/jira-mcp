#!/usr/bin/env node
import { JiraServer } from "./cli.ts";

const server = new JiraServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
