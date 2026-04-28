// Dump cached Anthropic report from Supabase to __fixtures__/research-anthropic.json.
// Run: npx tsx scripts/dump-fixture.ts
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const slug = process.argv[2] || "anthropic";

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, slug, display_name, domain")
    .eq("slug", slug)
    .maybeSingle();

  if (companyErr || !company) {
    console.error(`Company "${slug}" not found.`, companyErr?.message);
    process.exit(1);
  }

  const { data: reports, error: reportsErr } = await supabase
    .from("reports")
    .select("section_key, content_json, citations_json, model_version")
    .eq("company_id", company.id);

  if (reportsErr || !reports?.length) {
    console.error(`No reports for "${slug}".`, reportsErr?.message);
    process.exit(1);
  }

  const sections: Record<string, unknown> = {};
  for (const r of reports) {
    sections[r.section_key] = {
      content: r.content_json,
      citations: r.citations_json ?? [],
      model_version: r.model_version,
    };
  }

  const fixture = {
    company: {
      slug: company.slug,
      name: company.display_name,
      domain: company.domain,
    },
    disambiguation: {
      canonical_name: company.display_name,
      canonical_domain: company.domain,
      one_line_description: `${company.display_name} (from cached data).`,
      disambiguation_note: null,
    },
    sections,
  };

  const outPath = path.resolve(__dirname, "../__fixtures__/research-anthropic.json");
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sections).length} sections to ${outPath}`);
}

main();
