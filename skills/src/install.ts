import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Skills live alongside dist/ in the package root.
const SKILLS_ROOT = resolve(__dirname, "..");

const ALL_SKILLS = ["opengraphdb", "ogdb-cypher", "graph-explore", "schema-advisor", "data-import"];

// Canonical agent ids match crates/ogdb-cli/src/init_agent.rs::AGENTS so the
// npm wrapper, the Rust init binary, and the SKILL.md compatibility metadata
// all agree on one naming scheme.
type Platform = "claude" | "cursor" | "continue" | "aider" | "goose" | "codex";

const KNOWN_PLATFORMS: Platform[] = [
  "claude",
  "cursor",
  "continue",
  "aider",
  "goose",
  "codex",
];

interface InstallOptions {
  platform?: string;
  skillNames?: string[];
}

function detectPlatform(): Platform {
  // Project-local detection. Order matters: more-specific markers first so a
  // repo with both .claude and .cursor (rare but possible) resolves to claude.
  if (existsSync(".claude") || existsSync("CLAUDE.md")) return "claude";
  if (existsSync(".cursor") || existsSync(".cursorrules")) return "cursor";
  if (existsSync(".continue")) return "continue";
  if (existsSync(".aider.conf.yml") || existsSync(".aider")) return "aider";
  if (existsSync(".config/goose") || existsSync(".goosehints")) return "goose";
  if (existsSync(".codex")) return "codex";
  // Default to Claude Code format (most structured tree).
  return "claude";
}

function loadSkill(skillName: string): string {
  const skillDir = join(SKILLS_ROOT, skillName);
  if (!existsSync(skillDir)) {
    throw new Error(
      `Skill not found: ${skillName}. Run 'npx @opengraphdb/skills list' to see available skills.`,
    );
  }

  const skillMd = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
  const rulesDir = join(skillDir, "rules");
  let combined = skillMd;

  if (existsSync(rulesDir)) {
    const ruleFiles = readdirSync(rulesDir)
      .filter((f) => f.endsWith(".md"))
      .sort();

    for (const ruleFile of ruleFiles) {
      const ruleContent = readFileSync(join(rulesDir, ruleFile), "utf-8");
      combined += `\n\n---\n\n${ruleContent}`;
    }
  }

  return combined;
}

function countRuleFiles(skillName: string): number {
  const rulesDir = join(SKILLS_ROOT, skillName, "rules");
  if (!existsSync(rulesDir)) return 0;
  return readdirSync(rulesDir).filter((f) => f.endsWith(".md")).length;
}

// Recursively copy every file under `src` into `dst`. Used by installClaude
// to deposit the full skill tree (references/, scripts/, eval/) — the prior
// implementation only copied SKILL.md + rules/, which silently dropped 13/14
// of the master skill's files and broke every relative link in the bundle.
function copyTree(src: string, dst: string): number {
  let copied = 0;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      copied += copyTree(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
      copied += 1;
    }
  }
  return copied;
}

function installClaude(skills: string[]): void {
  for (const skillName of skills) {
    const skillDir = join(SKILLS_ROOT, skillName);
    const targetDir = join(".claude", "skills", skillName);
    const fileCount = copyTree(skillDir, targetDir);
    console.log(`  Installed ${skillName} -> .claude/skills/${skillName}/ (${fileCount} files)`);
  }
}

function installSingleFile(skills: string[], targetPath: string, header: string): void {
  const sections: string[] = [header];

  for (const skillName of skills) {
    const content = loadSkill(skillName);
    sections.push(`\n## Skill: ${skillName}\n\n${content}`);
  }

  const targetDir = dirname(targetPath);
  if (targetDir !== ".") {
    mkdirSync(targetDir, { recursive: true });
  }
  writeFileSync(targetPath, sections.join("\n"));
  console.log(`  Installed ${skills.length} skill(s) -> ${targetPath}`);
}

export async function install(options: InstallOptions): Promise<void> {
  const requestedPlatform = options.platform as Platform | undefined;
  if (requestedPlatform && !KNOWN_PLATFORMS.includes(requestedPlatform)) {
    throw new Error(
      `Unknown platform: ${requestedPlatform}. Use one of: ${KNOWN_PLATFORMS.join(", ")}`,
    );
  }
  const platform: Platform = requestedPlatform || detectPlatform();
  const skills = options.skillNames?.length
    ? options.skillNames.filter((s) => ALL_SKILLS.includes(s))
    : ALL_SKILLS.filter((s) => existsSync(join(SKILLS_ROOT, s)));

  if (skills.length === 0) {
    console.log("No skills to install. Run 'npx @opengraphdb/skills list' to see available skills.");
    return;
  }

  console.log(`\nInstalling ${skills.length} OpenGraphDB skill(s) for ${platform}...\n`);

  switch (platform) {
    case "claude":
      installClaude(skills);
      break;
    case "cursor":
      installSingleFile(
        skills,
        ".cursorrules",
        "# OpenGraphDB Skills\n\nThese rules teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n",
      );
      break;
    case "continue":
      installSingleFile(
        skills,
        ".continue/rules/opengraphdb.md",
        "# OpenGraphDB Skills\n\nThese rules teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n",
      );
      break;
    case "aider":
      // Aider's load-on-startup convention is a `.aider.conf.yml` `read:`
      // entry pointing at a markdown file. We drop the bundle into
      // `.aider/opengraphdb-skills.md` and leave wiring to the user (the
      // alternative — auto-editing .aider.conf.yml — is the Rust binary's
      // job; the npm wrapper deliberately stays declarative).
      installSingleFile(
        skills,
        ".aider/opengraphdb-skills.md",
        "# OpenGraphDB Skills (for Aider)\n\nAdd to ~/.aider.conf.yml:\n\n```yaml\nread:\n  - .aider/opengraphdb-skills.md\n```\n",
      );
      break;
    case "goose":
      // Goose's primary integration is the MCP extension (registered by the
      // Rust binary `ogdb init --agent`). It has no first-class skill
      // primitive, so we write a single hint file the user can reference.
      installSingleFile(
        skills,
        ".goosehints",
        "# OpenGraphDB Skills (for Goose)\n\nGoose primarily integrates via the MCP extension. Run `ogdb init --agent` from the project root to register the MCP server.\n",
      );
      break;
    case "codex":
      installSingleFile(
        skills,
        ".codex/instructions.md",
        "# OpenGraphDB Skills\n\nThese instructions teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n",
      );
      break;
    default: {
      // exhaustiveness — TypeScript will flag a missing case at compile time
      const _exhaustive: never = platform;
      throw new Error(`Unhandled platform: ${_exhaustive}`);
    }
  }

  const ruleCount = skills.reduce((sum, s) => sum + countRuleFiles(s), 0);
  console.log(`\nInstalled ${skills.length} skill(s) with ${ruleCount} rule file(s) for ${platform}.`);
  console.log("Done. Your AI coding tool now has OpenGraphDB expertise.");
  console.log("Try asking: \"Show me all node labels in the database\"");

  console.log("\nTip: For live database access, also install the MCP server:");
  console.log("  npx @opengraphdb/mcp");
  console.log("Add it to your AI tool's MCP config (see @opengraphdb/mcp README).\n");
}
