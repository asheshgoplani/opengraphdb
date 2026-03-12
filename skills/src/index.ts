#!/usr/bin/env node

import { install } from "./install.js";
import { runEvals } from "./eval.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "install") {
  const platform = args[1]; // optional: claude, cursor, copilot, codex, or auto-detect
  const skillNames = args.slice(2); // optional: specific skills, default all
  install({ platform, skillNames }).catch((err) => {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  });
} else if (command === "list") {
  console.log("Available OpenGraphDB skills:");
  console.log("  ogdb-cypher      NL-to-Cypher query generation");
  console.log("  graph-explore    Guided graph exploration and navigation");
  console.log("  schema-advisor   Graph schema design and index recommendations");
  console.log("  data-import      CSV/JSON/RDF import with schema detection");
  console.log("\nUsage: npx @opengraphdb/skills install [platform] [skill...]");
  console.log("Platforms: claude, cursor, copilot, codex (auto-detected if omitted)");
} else if (command === "eval") {
  const subcommand = args[1]; // "prompts" or "score"
  const target = args[2]; // skill name or response file
  runEvals({
    mode: subcommand as "prompts" | "score",
    skillName: subcommand === "prompts" ? target : undefined,
    responseFile: subcommand === "score" ? target : undefined,
  }).catch((err) => {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  });
} else {
  console.log("@opengraphdb/skills — AI coding skills for OpenGraphDB\n");
  console.log("Commands:");
  console.log("  install [platform] [skill...]    Install skills into your AI coding tool");
  console.log("  list                             List available skills");
  console.log("  eval prompts [skill]             Generate eval prompts for A/B testing");
  console.log("  eval score <responses.json>      Score eval responses");
  console.log("\nExamples:");
  console.log("  npx @opengraphdb/skills install              # Auto-detect platform, install all");
  console.log("  npx @opengraphdb/skills install claude       # Install all skills for Claude Code");
  console.log("  npx @opengraphdb/skills install cursor ogdb-cypher  # Install one skill for Cursor");
  console.log("  npx @opengraphdb/skills eval prompts         # Generate all eval prompts");
  console.log("  npx @opengraphdb/skills eval prompts ogdb-cypher  # Generate for one skill");
}
