import { exitQuestionnaire } from "../server/exit";
import { day } from "./parts";

// 013 AC-3: the leaver's exit questionnaire, opened signed out from the link HR sent. The leaver has no
// chat (their sign-in is closed), so, like the sign-in screen, this page takes its answers itself: the
// hosting public route passes `action`, which calls answerExit once. Without one it shows the questions only.
export async function ExitPage({ params, action }: { params: Record<string, string>; action?: (form: FormData) => Promise<void> }) {
  const view = await exitQuestionnaire(params.token ?? "");
  if (view.state === "unknown") return <div className="onboarding exit"><h1>Exit questionnaire</h1><p className="lede">This link doesn't work. Ask HR for a new one.</p></div>;
  if (view.state === "answered") return <div className="onboarding exit"><h1>Thank you, {view.personName}</h1><p className="lede">Your answers are with HR. The link has been used, so it no longer opens the questionnaire.</p></div>;
  if (view.state === "expired") return <div className="onboarding exit"><h1>Exit questionnaire</h1><p className="lede">This link expired on {day(view.expiresAt.slice(0, 10))}. Ask HR for a new one.</p></div>;
  const questions = view.questions.map((q) => (
    <div key={q.id}><label htmlFor={`exit-${q.id}`}>{q.text}</label><textarea id={`exit-${q.id}`} name={q.id} maxLength={2000} readOnly={!action} /></div>
  ));
  return (
    <div className="onboarding exit">
      <h1>Exit questionnaire</h1>
      <p className="lede">{view.personName}, thank you for your time with us. HR reads every answer; answer as many questions as you like. The link works once, until {day(view.expiresAt.slice(0, 10))}.</p>
      {action
        ? <form action={action} className="card">{questions}<button type="submit" className="btn primary">Send answers</button></form>
        : <div className="card">{questions}</div>}
    </div>
  );
}
