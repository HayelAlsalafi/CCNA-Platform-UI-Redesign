/** Learning navigation, not book attribution or the official objective catalog. */
export const curriculumVersion = "ccna-navigation-2026-10-v1";
const definitions = [
  [
    "Network Fundamentals",
    "Networking, Ethernet, IPv4 and IPv6.",
    "Core networking|Addressing and wireless",
    3,
    [
      "Introduction to TCP/IP Networking",
      "Fundamentals of Ethernet LANs",
      "Fundamentals of WANs and IP Routing",
      "IPv4 Addressing and Subnetting",
      "IPv6 Addressing and Subnetting",
      "Fundamentals of Wireless Networks",
    ],
  ],
  [
    "Network Access",
    "Switching, VLANs, STP and Wireless.",
    "Ethernet switching|Segmentation and wireless",
    3,
    [
      "Implementing Ethernet LANs",
      "Analyzing Ethernet LAN Switching",
      "Configuring Switch Interfaces",
      "VLANs and Trunking",
      "STP, RSTP and EtherChannel",
      "Wireless Architectures and WLAN Configuration",
    ],
  ],
  [
    "IP Connectivity",
    "Routing, Static Routes and OSPF.",
    "Routing foundations|Troubleshooting and routing protocols",
    3,
    [
      "Operating Cisco Routers",
      "IPv4 Static Routing",
      "IP Routing in the LAN",
      "Troubleshooting IPv4 Routing",
      "OSPF Concepts and Configuration",
      "IPv6 Routing",
    ],
  ],
  [
    "IP Services",
    "DHCP, NAT, QoS and Network Management.",
    "Address and management services|Traffic and operations",
    3,
    [
      "DHCP and DNS",
      "Network Address Translation",
      "Device Management Protocols",
      "Quality of Service",
      "Miscellaneous IP Services",
    ],
  ],
  [
    "Security Fundamentals",
    "ACLs, Device Security and Network Protection.",
    "Security and access control|Access-layer protection",
    3,
    [
      "Security Architectures",
      "Securing Network Devices",
      "IPv4 Access Control Lists",
      "Switch Port Security",
      "DHCP Snooping and ARP Inspection",
      "Wireless Security",
    ],
  ],
  [
    "Automation and Programmability",
    "Controllers, SD-Access, APIs and Automation.",
    "Controller architectures|Interfaces and tooling",
    2,
    [
      "Controller-Based Networking",
      "Cisco Software-Defined Access",
      "REST APIs and JSON",
      "Ansible, Puppet and Chef",
    ],
  ],
] as const;
export const curriculumDomains = definitions.map(
  ([title, description, sectionNames, split, titles], index) => ({
    id: `d${index + 1}`,
    number: String(index + 1).padStart(2, "0"),
    title,
    description,
    sections: sectionNames.split("|").map((name, section) => ({
      id: `d${index + 1}-s${section + 1}`,
      title: name,
      chapters: titles
        .slice(section === 0 ? 0 : split, section === 0 ? split : titles.length)
        .map((title, offset) => ({
          id: `d${index + 1}-c${(section === 0 ? 0 : split) + offset + 1}`,
          title,
          description: `Explore ${title.toLowerCase()} through the associated learning topics and published practice questions.`,
        })),
    })),
  }),
);
/** Exact, reviewed slug bindings. Multiple chapter references retain ONE topic UUID. */
export const topicChapterBindings: Readonly<Record<string, readonly string[]>> = {
  "ccna-v1-1-s7-network-devices": ["d1-c1"],
  "ccna-v1-1-s7-media-and-transport": ["d1-c2", "d1-c1"],
  "ccna-v1-1-s7-ipv4-subnetting": ["d1-c4"],
  "ccna-v1-1-s7-ipv6-addressing": ["d1-c5"],
  "ccna-v1-1-s7-vlans-and-trunks": ["d2-c4"],
  "ccna-v1-1-s7-stp-and-etherchannel": ["d2-c5"],
  "ccna-v1-1-s7-discovery-and-management": ["d2-c3"],
  "ccna-v1-1-s7-controller-wlan": ["d2-c6"],
  "ccna-v1-1-s7-routing-table": ["d3-c1"],
  "ccna-v1-1-s7-static-routing": ["d3-c2", "d3-c6"],
  "ccna-v1-1-s7-ospfv2": ["d3-c5"],
  "ccna-v1-1-s7-first-hop-redundancy": ["d3-c3"],
  "ccna-v1-1-s7-inside-source-nat": ["d4-c2"],
  "ccna-v1-1-s7-dhcp-and-dns": ["d4-c1"],
  "ccna-v1-1-s7-monitoring-and-time": ["d4-c3"],
  "ccna-v1-1-s7-qos-and-secure-operations": ["d4-c4", "d4-c5"],
  "ccna-v1-1-s7-risk-and-device-access": ["d5-c1", "d5-c2"],
  "ccna-v1-1-s7-acls-and-vpns": ["d5-c3"],
  "ccna-v1-1-s7-layer2-security": ["d5-c5"],
  "ccna-v1-1-s7-aaa-and-wlan-security": ["d5-c6"],
  "ccna-v1-1-s7-controller-automation": ["d6-c1", "d6-c2"],
  "ccna-v1-1-s7-rest-and-json": ["d6-c3"],
  "ccna-v1-1-s7-ansible-and-terraform": ["d6-c4"],
};
export type CurriculumTopic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "ACTIVE" | "DISABLED";
  questionCount: number;
};
export function mapCurriculumTopics(topics: CurriculumTopic[]) {
  const mapped: (CurriculumTopic & { chapterIds: string[] })[] = [],
    unmapped: (CurriculumTopic & { reason: string })[] = [],
    ambiguous: (CurriculumTopic & { reason: string })[] = [];
  const chapterIds = new Set(
    curriculumDomains.flatMap((d) => d.sections.flatMap((s) => s.chapters.map((c) => c.id))),
  );
  const ids = new Map<string, number>(),
    slugs = new Map<string, number>();
  for (const t of topics) {
    ids.set(t.id, (ids.get(t.id) ?? 0) + 1);
    slugs.set(t.slug, (slugs.get(t.slug) ?? 0) + 1);
  }
  for (const topic of topics) {
    const bindings = topicChapterBindings[topic.slug];
    if (ids.get(topic.id) !== 1 || slugs.get(topic.slug) !== 1) {
      ambiguous.push({
        ...topic,
        reason: "Duplicate stable identifier; explicit review required.",
      });
    } else if (!bindings) {
      unmapped.push({ ...topic, reason: "No reviewed chapter binding for this exact slug." });
    } else if (bindings.some((id) => !chapterIds.has(id))) {
      ambiguous.push({ ...topic, reason: "Unknown configured chapter; review configuration." });
    } else mapped.push({ ...topic, chapterIds: [...bindings] });
  }
  return { mapped, unmapped, ambiguous };
}
