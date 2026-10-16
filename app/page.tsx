const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const repo = "https://github.com/chan4lk/amax";

const modules = [
  "Projects & proposals",
  "Releases",
  "Time",
  "Allocations",
  "People",
  "Leave",
  "Payroll (LK + AU)",
  "Recruitment",
  "Learning",
  "Financials",
  "Presales",
  "Access & licences",
  "Helpdesk",
  "Insights",
];

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <p className="mark">amax</p>
        <h1>Agents keep the records. People make the decisions.</h1>
        <p className="lede">
          An ERP for software and professional-services companies. Commits log time, deployments move
          releases, and the inbox agent turns Teams and email into suggestions you accept. Everything is
          added through one chat, and every capability is an MCP tool with the same permissions as the UI.
        </p>
        <div className="actions">
          <a className="btn primary" href={`${base}/mock/`}>
            Open the interactive mock
          </a>
          <a className="btn" href={`${repo}/blob/main/PRODUCT.md`}>
            Product brief
          </a>
          <a className="btn" href={`${repo}/blob/main/docs/roadmap.md`}>
            Roadmap
          </a>
        </div>
        <ul className="chips" aria-label="Modules in the mock">
          {modules.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </section>
      <section className="preview" aria-label="Preview of the mock">
        <iframe src={`${base}/mock/`} title="amax interactive mock" loading="lazy" />
      </section>
      <footer>
        Demo data is fictional (Lumen Labs). Built with specclaw:{" "}
        <a href={`${repo}/blob/main/.specclaw/changes/001-amax-foundation/change.md`}>change 001</a>.
      </footer>
    </main>
  );
}
