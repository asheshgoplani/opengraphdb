import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEvalFile,
  generatePrompt,
  loadSkillContent,
  printReport,
  scoreResponse,
} from "./eval-runner.js";
import type { EvalResult } from "./eval-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(__dirname, "..");
const EVALS_DIR = join(SKILLS_ROOT, "evals");

interface EvalOptions {
  skillName?: string;
  mode?: "prompts" | "score";
  responseFile?: string;
}

export async function runEvals(options: EvalOptions): Promise<void> {
  if (!existsSync(EVALS_DIR)) {
    console.log("No evals directory found.");
    return;
  }

  const evalFiles = readdirSync(EVALS_DIR)
    .filter((f) => f.endsWith(".eval.yaml") || f.endsWith(".eval.json"))
    .filter((f) => !options.skillName || f.startsWith(options.skillName));

  if (evalFiles.length === 0) {
    console.log(
      options.skillName
        ? `No eval files found for skill: ${options.skillName}`
        : "No eval files found."
    );
    return;
  }

  for (const evalFile of evalFiles) {
    const content = readFileSync(join(EVALS_DIR, evalFile), "utf-8");
    const suite = parseEvalFile(content);

    console.log(
      `\nRunning evals for: ${suite.skill} (${suite.cases.length} cases)`
    );

    if (options.mode === "prompts") {
      // Generate prompts mode: output prompts for manual LLM A/B testing
      const skillDir = join(SKILLS_ROOT, suite.skill);
      let skillContent: string | null = null;

      if (existsSync(join(skillDir, "SKILL.md"))) {
        skillContent = loadSkillContent(skillDir);
      } else {
        console.log(`  Warning: Skill directory not found at ${skillDir}`);
      }

      console.log("\n--- Prompts (WITH skill) ---\n");
      for (const evalCase of suite.cases) {
        console.log(`\n### ${evalCase.name} (${evalCase.difficulty}) ###\n`);
        console.log(generatePrompt(evalCase, skillContent));
        console.log("\n---\n");
      }

      console.log("\n--- Prompts (WITHOUT skill) ---\n");
      for (const evalCase of suite.cases) {
        console.log(`\n### ${evalCase.name} (${evalCase.difficulty}) ###\n`);
        console.log(generatePrompt(evalCase, null));
        console.log("\n---\n");
      }
    } else if (options.mode === "score" && options.responseFile) {
      // Score mode: score pre-recorded responses against eval criteria
      if (!existsSync(options.responseFile)) {
        console.log(`Response file not found: ${options.responseFile}`);
        return;
      }

      try {
        const responseData = JSON.parse(
          readFileSync(options.responseFile, "utf-8")
        ) as Record<string, string>;

        const results: EvalResult[] = [];
        for (const evalCase of suite.cases) {
          const response = responseData[evalCase.name];
          if (response) {
            results.push(scoreResponse(response, evalCase));
          } else {
            console.log(`  Skipping ${evalCase.name}: no response found`);
          }
        }

        printReport(suite.skill, results, "with-skill");
      } catch (err) {
        console.log(
          `Failed to parse response file: ${(err as Error).message}`
        );
        console.log(
          'Expected JSON format: {"case-name": "response text", ...}'
        );
      }
    } else {
      // Help mode
      console.log("\nUsage:");
      console.log(
        "  npx @opengraphdb/skills eval prompts [skill-name]  Generate eval prompts for A/B testing"
      );
      console.log(
        "  npx @opengraphdb/skills eval score <responses.json> Score eval responses"
      );
      console.log("\nExamples:");
      console.log(
        "  npx @opengraphdb/skills eval prompts              Generate prompts for all skills"
      );
      console.log(
        "  npx @opengraphdb/skills eval prompts ogdb-cypher   Generate prompts for one skill"
      );
      console.log(
        "  npx @opengraphdb/skills eval score results.json    Score recorded responses"
      );
      console.log(
        "\nWorkflow: Generate prompts, run through your LLM with and without skill,"
      );
      console.log(
        "then score results to measure skill improvement.\n"
      );
    }
  }
}
