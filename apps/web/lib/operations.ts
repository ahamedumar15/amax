import type { IconName } from "@amax/ui";

/**
 * 055: the Operations screens not built yet. Each opens a "Coming soon" page naming the change that
 * ships it; the nav shows them to Admin and IT Admin ("operations:read").
 */
export const OPERATIONS: { slug: string; title: string; icon: IconName; change: string; changeTitle: string }[] = [
  { slug: "it-access", title: "Access and licences", icon: "key", change: "021", changeTitle: "IT: access, licences and devices" },
  { slug: "helpdesk", title: "Helpdesk", icon: "help", change: "022", changeTitle: "Helpdesk: IT, HR and facilities queues" },
  { slug: "compliance", title: "Compliance", icon: "doc", change: "036", changeTitle: "Compliance: policies, registers, audit integrity and evidence" },
  { slug: "experience", title: "Digital experience", icon: "chart", change: "037", changeTitle: "Digital employee experience, without a desk agent" },
];

export const operationOf = (slug: string) => OPERATIONS.find((o) => o.slug === slug);
