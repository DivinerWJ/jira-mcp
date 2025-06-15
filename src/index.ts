#!/usr/bin/env bun
import { JiraServer } from "./cli.ts";

const server = new JiraServer();
server.run().catch(() => { });
