import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { curriculumDomains, mapCurriculumTopics, topicChapterBindings } from "./curriculum-config";
const state = vi.hoisted(() => ({
  selection: {} as Record<string, unknown>,
  rows: [] as unknown[],
  join: null as any,
  where: null as any,
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return {
    ...schema,
    db: {
      select: (selection: Record<string, unknown>) => {
        state.selection = selection;
        const chain: any = {};
        for (const key of ["from", "leftJoin", "where", "groupBy"]) chain[key] = () => chain;
        chain.leftJoin = (_table: unknown, on: unknown) => {
          state.join = on;
          return chain;
        };
        chain.where = (on: unknown) => {
          state.where = on;
          return chain;
        };
        chain.orderBy = async () => state.rows;
        return chain;
      },
    },
  };
});
import { curriculumSummary, curriculumMappingReport, curriculumTopics } from "./curriculum";
const topic = (slug: string, id = slug) => ({
  id,
  slug,
  name: slug,
  description: "Real description",
  status: "ACTIVE" as const,
  questionCount: 3,
});
it("has precisely six ordered domains and the 33 requested chapters", () => {
  expect(curriculumDomains.map((d) => d.title)).toEqual([
    "Network Fundamentals",
    "Network Access",
    "IP Connectivity",
    "IP Services",
    "Security Fundamentals",
    "Automation and Programmability",
  ]);
  expect(curriculumDomains.map((d) => d.sections.flatMap((s) => s.chapters).length)).toEqual([
    6, 6, 6, 5, 6, 4,
  ]);
  const requested = [
    "Introduction to TCP/IP Networking",
    "Fundamentals of Ethernet LANs",
    "Fundamentals of WANs and IP Routing",
    "IPv4 Addressing and Subnetting",
    "IPv6 Addressing and Subnetting",
    "Fundamentals of Wireless Networks",
    "Implementing Ethernet LANs",
    "Analyzing Ethernet LAN Switching",
    "Configuring Switch Interfaces",
    "VLANs and Trunking",
    "STP, RSTP and EtherChannel",
    "Wireless Architectures and WLAN Configuration",
    "Operating Cisco Routers",
    "IPv4 Static Routing",
    "IP Routing in the LAN",
    "Troubleshooting IPv4 Routing",
    "OSPF Concepts and Configuration",
    "IPv6 Routing",
    "DHCP and DNS",
    "Network Address Translation",
    "Device Management Protocols",
    "Quality of Service",
    "Miscellaneous IP Services",
    "Security Architectures",
    "Securing Network Devices",
    "IPv4 Access Control Lists",
    "Switch Port Security",
    "DHCP Snooping and ARP Inspection",
    "Wireless Security",
    "Controller-Based Networking",
    "Cisco Software-Defined Access",
    "REST APIs and JSON",
    "Ansible, Puppet and Chef",
  ];
  expect(
    curriculumDomains.flatMap((d) => d.sections.flatMap((s) => s.chapters.map((c) => c.title))),
  ).toEqual(requested);
});
it("maps the pilot by exact slugs; AI remains explicit review, never guessed by title", () => {
  const source = JSON.parse(
    readFileSync(
      new URL("../../../../docs/content/ccna-200-301/source/curriculum.json", import.meta.url),
      "utf8",
    ),
  );
  const report = mapCurriculumTopics(source.topics.map((t: any) => topic(t.slug)));
  expect(report.mapped).toHaveLength(23);
  expect(report.unmapped.map((t) => t.slug)).toEqual(["ccna-v1-1-s7-ai-network-operations"]);
  expect(report.ambiguous).toHaveLength(0);
  expect(mapCurriculumTopics([topic("legacy-routing")]).unmapped).toHaveLength(1);
});
it("keeps original UUIDs and counts when one topic references multiple chapters", () => {
  const input = topic("ccna-v1-1-s7-static-routing", "original-uuid");
  const report = mapCurriculumTopics([input]);
  expect(report.mapped[0]).toEqual({ ...input, chapterIds: ["d3-c2", "d3-c6"] });
  expect(report.mapped).toHaveLength(1);
  expect(input).not.toHaveProperty("chapterIds");
});
it("rejects duplicate IDs or slugs as ambiguous instead of merging them", () => {
  const t = topic(Object.keys(topicChapterBindings)[0]);
  expect(mapCurriculumTopics([t, { ...t, id: "another" }]).ambiguous).toHaveLength(2);
  expect(mapCurriculumTopics([t, { ...t, slug: "other" }]).mapped).toHaveLength(0);
});
it("summary reads metadata/counts only and excludes unmapped records", async () => {
  state.rows = [topic("ccna-v1-1-s7-static-routing"), topic("unknown")];
  const summary = await curriculumSummary();
  expect(summary.topics).toHaveLength(1);
  expect(summary.topics[0].questionCount).toBe(3);
  expect(summary.counts).toEqual({availableQuestions:6,mappedQuestions:3});
  expect(Object.keys(state.selection)).toEqual([
    "id",
    "slug",
    "name",
    "description",
    "status",
    "questionCount",
  ]);
  expect(JSON.stringify(summary)).not.toMatch(/isCorrect|explanation|correctAnswer/);
  expect((await curriculumMappingReport()).unmapped).toHaveLength(1);
});
it("counts only published questions on active topics and limits the learner inventory to ACTIVE", async () => {
  await curriculumTopics();
  const dialect = new PgDialect();
  const join = dialect.sqlToQuery(state.join),
    where = dialect.sqlToQuery(state.where);
  expect(join.params).toEqual(["ACTIVE", "ACTIVE"]);
  expect(join.sql).toContain('"questions"."topic_id"');
  expect(join.sql).toContain('"questions"."status"');
  expect(where.params).toEqual(["ACTIVE"]);
});
it("Admin report includes disabled metadata without counting its hidden questions", async () => {
  await curriculumTopics(true);
  expect(state.where).toBeUndefined();
  expect(new PgDialect().sqlToQuery(state.join).params).toEqual(["ACTIVE", "ACTIVE"]);
});
