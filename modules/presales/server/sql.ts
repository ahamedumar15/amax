import { sql } from "drizzle-orm";

export const LIVE = sql`o.removed_at is null`;

// Health is calculated from the opportunity's risks, never typed: an open high-impact issue is
// red; an open high-impact risk, or any open issue, is amber; otherwise green.
export const HEALTH = sql`(select case
    when bool_or(r.kind = 'issue' and r.impact = 'high') then 'red'
    when bool_or(r.kind = 'issue' or (r.kind = 'risk' and r.impact = 'high')) then 'amber'
    else 'green' end
  from presales.risk r where r.opportunity_id = o.id and r.status = 'open')`;

export const COLS = sql`o.*, c.name as client_name, c.country as client_country, coalesce(${HEALTH}, 'green') as health`;
export const FROM = sql`presales.opportunity o join presales.client c on c.id = o.client_id`;
export const OPPORTUNITY = sql`select ${COLS} from ${FROM}`;
