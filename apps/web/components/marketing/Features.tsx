import { Art, type ArtName } from "./Art";

type Area = { title: string; body: string; tone: string; art: ArtName; coming?: boolean };

const AREAS: Area[] = [
  { title: "Delivery", tone: "info", art: "rocket", body: "Projects, specclaw proposals, releases across Dev, QA, UAT and Prod, time and approvals, allocations and forecasts." },
  { title: "People and payroll", tone: "good", art: "people", coming: true, body: "Core HR, leave, onboarding and offboarding. Payroll with Sri Lanka and Australia packs." },
  { title: "Finance and sales", tone: "attention", art: "coins", body: "Contracts, billing milestones, expenses and presales pipeline. Integrates with Xero, QuickBooks or Business Central." },
  { title: "Operations", tone: "sky", art: "key", body: "IT assets and access, compliance registers, incidents, notifications and insights." },
  { title: "Platform", tone: "problem", art: "shield", body: "MCP server for every endpoint, git-identity mapping, Entra ID sign-in and SCIM, API keys and webhooks." },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="mk-features">
      <h2 id="mk-features">One system for delivery, people and money</h2>
      <ul className="mk-grid">
        {AREAS.map((a) => (
          <li key={a.title} className={`mk-f ${a.tone}`}>
            <Art name={a.art} />
            <h3>{a.title}</h3>
            <p>{a.body}</p>
            {a.coming && <span className="chip">Coming</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
