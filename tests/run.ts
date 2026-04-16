import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { analyze, buildComment, formatText, normalizeDate } from "../lib/analyzer";
import { normalizeRows, parseWorkbook } from "../lib/excel";
import { RawRow } from "../lib/types";

const H = {
  mediaGroup: "\uB9E4\uCCB4(\uB300\uBD84\uB958)",
  media: "\uB9E4\uCCB4",
  company: "\uD68C\uC0AC",
  campaign: "\uCEA0\uD398\uC778",
  adGroup: "\uADF8\uB8F9",
  creativeCode: "\uAD11\uACE0\uB9E4\uCCB43",
  impressions: "\uB178\uCD9C",
  clicks: "\uD074\uB9AD",
  cost: "\uBE44\uC6A9",
  assignedNonDb: "\uBC30\uB2F9_N",
  assigned: "\uBC30\uB2F9",
  landing: "\uB79C\uB529",
  landingCategory: "\uB79C\uB529\uAD6C\uBD84",
  mediaType: "NEW \uB9E4\uCCB4",
} as const;

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await run("normalizeRows maps current aliases including company campaign and group", () => {
    const rows = normalizeRows([
      {
        DATE: "2026-04-05",
        [H.mediaGroup]: "\uD14C\uC2A4\uD2B8",
        [H.media]: "\uD14C\uC2A4\uD2B8",
        [H.company]: "\uB9E4\uB4DC\uC5C5",
        [H.campaign]: "\uCEA0\uD398\uC778A",
        [H.adGroup]: "\uADF8\uB8F9 1",
        [H.creativeCode]: "CR-001",
        [H.impressions]: "1000",
        [H.clicks]: "25",
        [H.cost]: "50000",
        DB: "4",
        [H.assignedNonDb]: "1",
        [H.assigned]: "2",
        [H.landing]: "A",
        [H.landingCategory]: "\uBA54\uC778",
        [H.mediaType]: "DA",
      },
    ]);

    assert.equal(rows[0].mediaGroup, "\uD14C\uC2A4\uD2B8");
    assert.equal(rows[0].media, "\uD14C\uC2A4\uD2B8");
    assert.equal(rows[0].company, "\uB9E4\uB4DC\uC5C5");
    assert.equal(rows[0].campaign, "\uCEA0\uD398\uC778A");
    assert.equal(rows[0].adGroup, "\uADF8\uB8F9 1");
    assert.equal(rows[0].cost, 50000);
  });

  await run("normalizeRows prefers displayed DATE text over raw date object", () => {
    const rows = normalizeRows(
      [{ DATE: new Date("2026-04-05T14:59:08.000Z"), DB: "1" }],
      [{ DATE: "4/6/26", DB: "1" }],
    );

    assert.equal(normalizeDate(rows[0].date), "2026-04-06");
  });

  await run("normalizeRows excludes bigcraft company and creative rows", () => {
    const rows = normalizeRows([
      { DATE: "2026-04-05", [H.company]: "\uBE45\uD06C\uB798\uD504\uD2B8", [H.creativeCode]: "our-creative", DB: "1" },
      { DATE: "2026-04-05", [H.creativeCode]: "bigcraft_001", DB: "1" },
      { DATE: "2026-04-05", [H.creativeCode]: "BIGC-002", DB: "1" },
      { DATE: "2026-04-05", [H.company]: "\uB9E4\uB4DC\uC5C5", [H.creativeCode]: "our-creative", DB: "1" },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].creativeCode, "our-creative");
    assert.equal(rows[0].company, "\uB9E4\uB4DC\uC5C5");
  });

  await run("parseWorkbook reads MASTER_RAW and excludes bigcraft rows", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        DATE: "2026-04-04",
        [H.mediaGroup]: "\uD14C\uC2A4\uD2B8",
        [H.media]: "\uD14C\uC2A4\uD2B8",
        [H.company]: "\uBE45\uD06C\uB798\uD504\uD2B8",
        [H.campaign]: "\uCEA0\uD398\uC778A",
        [H.adGroup]: "\uADF8\uB8F9 1",
        [H.creativeCode]: "bigcraft-ignored",
        [H.impressions]: 500,
        [H.clicks]: 10,
        [H.cost]: 10000,
        db: 1,
        [H.assignedNonDb]: 0,
        [H.assigned]: 0,
        [H.landing]: "L0",
        [H.landingCategory]: "\uBA54\uC778",
        [H.mediaType]: "DA",
      },
      {
        DATE: "2026-04-04",
        [H.mediaGroup]: "\uD14C\uC2A4\uD2B8",
        [H.media]: "\uD14C\uC2A4\uD2B8",
        [H.company]: "\uB9E4\uB4DC\uC5C5",
        [H.campaign]: "\uCEA0\uD398\uC778A",
        [H.adGroup]: "\uADF8\uB8F9 1",
        [H.creativeCode]: "CR-001",
        [H.impressions]: 1000,
        [H.clicks]: 30,
        [H.cost]: 70000,
        db: 5,
        [H.assignedNonDb]: 0,
        [H.assigned]: 3,
        [H.landing]: "L1",
        [H.landingCategory]: "\uBA54\uC778",
        [H.mediaType]: "DA",
      },
      {
        DATE: "2026-04-05",
        [H.mediaGroup]: "\uD14C\uC2A4\uD2B8",
        [H.media]: "\uD14C\uC2A4\uD2B8",
        [H.company]: "\uB9E4\uB4DC\uC5C5",
        [H.campaign]: "\uCEA0\uD398\uC778A",
        [H.adGroup]: "\uADF8\uB8F9 1",
        [H.creativeCode]: "CR-001",
        [H.impressions]: 1500,
        [H.clicks]: 40,
        [H.cost]: 90000,
        db: 6,
        [H.assignedNonDb]: 0,
        [H.assigned]: 4,
        [H.landing]: "L1",
        [H.landingCategory]: "\uBA54\uC778",
        [H.mediaType]: "DA",
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "MASTER_RAW");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const result = await parseWorkbook(buffer);

    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.availableDates, ["2026-04-04", "2026-04-05"]);
    assert.equal(result.rows[1].company, "\uB9E4\uB4DC\uC5C5");
    assert.equal(result.rows[1].campaign, "\uCEA0\uD398\uC778A");
    assert.equal(result.rows[1].adGroup, "\uADF8\uB8F9 1");
    assert.equal(result.diagnostics.sheetName, "MASTER_RAW");
  });

  await run("parseWorkbook rejects files without MASTER_RAW", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([{ DATE: "2026-04-05" }]);
    XLSX.utils.book_append_sheet(workbook, sheet, "\uC694\uC57D");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    await assert.rejects(() => parseWorkbook(buffer), /MASTER_RAW/);
  });

  const rows: RawRow[] = [
    {
      date: "2026-03-31",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-DA-1",
      impressions: 1000,
      clicks: 40,
      cost: 100000,
      db: 10,
      assignedNonDb: 0,
      assigned: 2,
      landing: "\uBA54\uC778",
      landingCategory: "\uC77C\uBC18",
      mediaType: "DA",
    },
    {
      date: "2026-04-01",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-DA-1",
      impressions: 1200,
      clicks: 44,
      cost: 110000,
      db: 12,
      assignedNonDb: 0,
      assigned: 3,
      landing: "\uBA54\uC778",
      landingCategory: "\uC77C\uBC18",
      mediaType: "DA",
    },
    {
      date: "2026-04-06",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-DA-1",
      impressions: 1500,
      clicks: 55,
      cost: 130000,
      db: 15,
      assignedNonDb: 0,
      assigned: 4,
      landing: "\uBA54\uC778",
      landingCategory: "\uC77C\uBC18",
      mediaType: "DA",
    },
    {
      date: "2026-03-31",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-VA-1",
      impressions: 900,
      clicks: 30,
      cost: 90000,
      db: 9,
      assignedNonDb: 0,
      assigned: 1,
      landing: "\uC601\uC0C1",
      landingCategory: "\uC77C\uBC18",
      mediaType: "VA",
    },
    {
      date: "2026-04-01",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-VA-1",
      impressions: 950,
      clicks: 31,
      cost: 95000,
      db: 8,
      assignedNonDb: 0,
      assigned: 1,
      landing: "\uC601\uC0C1",
      landingCategory: "\uC77C\uBC18",
      mediaType: "VA",
    },
    {
      date: "2026-04-06",
      mediaGroup: "\uBA54\uD0C0",
      media: "\uBA54\uD0C0",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778A",
      adGroup: "\uADF8\uB8F9 1",
      creativeCode: "M-VA-1",
      impressions: 1400,
      clicks: 50,
      cost: 125000,
      db: 14,
      assignedNonDb: 0,
      assigned: 5,
      landing: "\uC601\uC0C1",
      landingCategory: "\uC77C\uBC18",
      mediaType: "VA",
    },
    {
      date: "2026-04-06",
      mediaGroup: "\uD14C\uC2A4\uD2B8",
      media: "\uD14C\uC2A4\uD2B8",
      company: "\uB9E4\uB4DC\uC5C5",
      campaign: "\uCEA0\uD398\uC778B",
      adGroup: "\uADF8\uB8F9 2",
      creativeCode: "T-01",
      impressions: 1000,
      clicks: 60,
      cost: 70000,
      db: 11,
      assignedNonDb: 0,
      assigned: 2,
      landing: "\uD14C\uC2A4\uD2B8\uB79C\uB529",
      landingCategory: "\uC77C\uBC18",
      mediaType: "DA",
    },
  ];

  await run("normalizeDate supports string and excel serial inputs", () => {
    assert.equal(normalizeDate("2026/04/05"), "2026-04-05");
    assert.equal(normalizeDate("26/04/12"), "2026-04-12");
    assert.equal(normalizeDate("26-04-12"), "2026-04-12");
    assert.equal(normalizeDate("2026-04-05T15:00:00.000Z"), "2026-04-06");
    assert.match(normalizeDate(46017), /^\d{4}-\d{2}-\d{2}$/);
  });

  await run("analyze includes meta total and excludes bigcraft/other", () => {
    const result = analyze(rows, "2026-04-06");

    assert.equal(result.date, "2026-04-06");
    assert.equal(result.mediaGroups.BIGCRAFT.length, 0);
    assert.equal(result.mediaGroups.OTHER.length, 0);
    assert.ok(result.mediaGroups.DA.some((media) => media.key === "meta_total"));
    assert.match(formatText(result), /\(TOTAL\)/);
  });

  await run("buildComment returns actionable text", () => {
    const comment = buildComment(
      { cost: 60000, db: 6, assigned: 3, assignedNonDb: 0, impressions: 1200, clicks: 50 },
      { cost: 50000, db: 4, assigned: 2, assignedNonDb: 0, impressions: 1000, clicks: 40 },
      null,
    );

    assert.ok(comment.length > 0);
    assert.doesNotMatch(comment, /\uFFFD/);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
