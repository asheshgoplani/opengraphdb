import { readFileSync, readdirSync } from "node:fs";

export interface EvalCase {
  name: string;
  difficulty: string;
  input: string;
  context?: {
    schema?: {
      labels: string[];
      edge_types: string[];
      property_keys: string[];
    };
    data?: string;
  };
  expected: {
    must_contain?: string[];
    must_not_contain?: string[];
    pattern?: string;
  };
  scoring: Record<string, number>;
}

export interface EvalSuite {
  skill: string;
  version: string;
  description: string;
  cases: EvalCase[];
}

export interface EvalResult {
  caseName: string;
  difficulty: string;
  passed: boolean;
  score: number;
  maxScore: number;
  details: string[];
}

/**
 * Parse eval file content. Eval files use JSON format (with .eval.yaml
 * extension for readability). For full YAML support, add js-yaml as a
 * dependency.
 */
export function parseEvalFile(content: string): EvalSuite {
  try {
    return JSON.parse(content) as EvalSuite;
  } catch (err) {
    throw new Error(
      `Failed to parse eval file as JSON: ${(err as Error).message}. ` +
        "Eval files must be valid JSON. For YAML support, install js-yaml."
    );
  }
}

/**
 * Score a response string against an eval case's expected criteria.
 * Returns automated scoring based on pattern matching.
 * Manual scoring weights (from the eval case's `scoring` field) are
 * reported but require LLM-judge evaluation.
 */
export function scoreResponse(
  response: string,
  evalCase: EvalCase
): EvalResult {
  const details: string[] = [];
  let score = 0;
  let maxScore = 0;

  const expected = evalCase.expected;

  // Check must_contain keywords
  if (expected.must_contain) {
    for (const keyword of expected.must_contain) {
      maxScore += 1;
      if (response.includes(keyword)) {
        score += 1;
        details.push(`PASS: contains "${keyword}"`);
      } else {
        details.push(`FAIL: missing "${keyword}"`);
      }
    }
  }

  // Check must_not_contain keywords
  if (expected.must_not_contain) {
    for (const keyword of expected.must_not_contain) {
      maxScore += 1;
      if (!response.includes(keyword)) {
        score += 1;
        details.push(`PASS: does not contain "${keyword}"`);
      } else {
        details.push(`FAIL: should not contain "${keyword}"`);
      }
    }
  }

  // Check regex pattern
  if (expected.pattern) {
    maxScore += 2; // patterns are weighted higher
    try {
      const regex = new RegExp(expected.pattern, "i");
      if (regex.test(response)) {
        score += 2;
        details.push(`PASS: matches pattern /${expected.pattern}/`);
      } else {
        details.push(`FAIL: does not match pattern /${expected.pattern}/`);
      }
    } catch {
      details.push(`SKIP: invalid regex pattern /${expected.pattern}/`);
    }
  }

  // Report manual scoring criteria (require LLM-judge evaluation)
  for (const [criterion, weight] of Object.entries(evalCase.scoring)) {
    maxScore += weight;
    details.push(
      `MANUAL: "${criterion}" (weight: ${weight}) requires LLM judge`
    );
  }

  return {
    caseName: evalCase.name,
    difficulty: evalCase.difficulty,
    passed: maxScore > 0 ? score >= maxScore * 0.6 : false,
    score,
    maxScore,
    details,
  };
}

/**
 * Generate a prompt for A/B testing. When skillContent is provided,
 * the skill instructions are injected into the prompt (Condition B).
 * When null, only the raw context is included (Condition A).
 */
export function generatePrompt(
  evalCase: EvalCase,
  skillContent: string | null
): string {
  const parts: string[] = [];

  if (skillContent) {
    parts.push(`<skill>\n${skillContent}\n</skill>\n`);
  }

  if (evalCase.context?.schema) {
    const schema = evalCase.context.schema;
    parts.push("<database_schema>");
    parts.push(`Labels: ${schema.labels.join(", ")}`);
    parts.push(`Relationship Types: ${schema.edge_types.join(", ")}`);
    parts.push(`Property Keys: ${schema.property_keys.join(", ")}`);
    parts.push("</database_schema>\n");
  }

  if (evalCase.context?.data) {
    parts.push(`<data>\n${evalCase.context.data}\n</data>\n`);
  }

  parts.push(`User: ${evalCase.input}`);

  return parts.join("\n");
}

/**
 * Load skill content from disk: SKILL.md + all rules/*.md files
 * concatenated. Returns the combined skill instruction text.
 */
export function loadSkillContent(skillDir: string): string {
  const skillMd = readFileSync(`${skillDir}/SKILL.md`, "utf-8");
  let combined = skillMd;

  try {
    const rulesDir = `${skillDir}/rules`;
    const ruleFiles = readdirSync(rulesDir)
      .filter((f: string) => f.endsWith(".md"))
      .sort();
    for (const ruleFile of ruleFiles) {
      combined +=
        "\n\n---\n\n" + readFileSync(`${rulesDir}/${ruleFile}`, "utf-8");
    }
  } catch {
    // No rules directory, skill content is just SKILL.md
  }

  return combined;
}

/**
 * Print a formatted eval report to stdout.
 */
export function printReport(
  skillName: string,
  results: EvalResult[],
  mode: "with-skill" | "without-skill" | "comparison"
): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Eval Report: ${skillName} (${mode})`);
  console.log(`${"=".repeat(60)}\n`);

  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(
      `  [${status}] ${result.caseName} (${result.difficulty}) ${result.score}/${result.maxScore}`
    );
    for (const detail of result.details) {
      console.log(`         ${detail}`);
    }
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalCases = results.length;
  const pct =
    totalCases > 0 ? Math.round((totalPassed / totalCases) * 100) : 0;

  console.log(`\nSummary: ${totalPassed}/${totalCases} passed (${pct}%)\n`);
}
