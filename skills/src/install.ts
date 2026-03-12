import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Skills live alongside dist/ in the package root
const SKILLS_ROOT = resolve(__dirname, "..");

const ALL_SKILLS = ["ogdb-cypher", "graph-explore", "schema-advisor", "data-import"];

type Platform = "claude" | "cursor" | "copilot" | "codex";

interface InstallOptions {
  platform?: string;
  skillNames?: string[];
}

function detectPlatform(): Platform {
  // Check for platform indicators in the current project
  if (existsSync(".claude") || existsSync("CLAUDE.md")) return "claude";
  if (existsSync(".cursor") || existsSync(".cursorrules")) return "cursor";
  if (existsSync(".github/copilot-instructions.md")) return "copilot";
  if (existsSync(".codex")) return "codex";
  // Default to Claude Code format (most structured)
  return "claude";
}

function loadSkill(skillName: string): string {
  const skillDir = join(SKILLS_ROOT, skillName);
  if (!existsSync(skillDir)) {
    throw new Error(`Skill not found: ${skillName}. Run 'npx @opengraphdb/skills list' to see available skills.`);
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

function installClaude(skills: string[]): void {
  for (const skillName of skills) {
    const skillDir = join(SKILLS_ROOT, skillName);
    const targetDir = join(".claude", "skills", skillName);
    mkdirSync(targetDir, { recursive: true });

    // Copy SKILL.md
    const skillMd = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
    writeFileSync(join(targetDir, "SKILL.md"), skillMd);

    // Copy rules/
    const rulesDir = join(skillDir, "rules");
    if (existsSync(rulesDir)) {
      const targetRulesDir = join(targetDir, "rules");
      mkdirSync(targetRulesDir, { recursive: true });
      for (const ruleFile of readdirSync(rulesDir).filter((f) => f.endsWith(".md"))) {
        const content = readFileSync(join(rulesDir, ruleFile), "utf-8");
        writeFileSync(join(targetRulesDir, ruleFile), content);
      }
    }

    console.log(`  Installed ${skillName} -> .claude/skills/${skillName}/`);
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
  const platform = (options.platform as Platform) || detectPlatform();
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
        "# OpenGraphDB Skills\n\nThese rules teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n"
      );
      break;
    case "copilot":
      installSingleFile(
        skills,
        ".github/copilot-instructions.md",
        "# OpenGraphDB Skills\n\nThese instructions teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n"
      );
      break;
    case "codex":
      installSingleFile(
        skills,
        ".codex/instructions.md",
        "# OpenGraphDB Skills\n\nThese instructions teach you how to work with OpenGraphDB, a graph database with Cypher query support.\n"
      );
      break;
    default:
      throw new Error(`Unknown platform: ${platform}. Use: claude, cursor, copilot, or codex`);
  }

  console.log("\nDone! Your AI coding tool now has OpenGraphDB expertise.");
  console.log("Try asking: \"Show me all node labels in the database\"");
}
