// HR detail for the shared Lumen Labs people (fixtures.md). Kasun's record is the Person page in the mock.
export type Named = {
  no: string; department: string; joined: string; grade?: string; title?: string; location?: string; manager?: string;
  salary?: string; epf?: string; bank?: [string, string]; nextReview?: string; contract?: "permanent" | "fixed-term";
};

export const NAMED: Record<string, Named> = {
  maya: { no: "LL-0102", department: "Delivery", joined: "2019-02-11", grade: "M2", location: "Colombo, hybrid", salary: "540000", nextReview: "2027-02-01" },
  nimal: { no: "LL-0233", department: "Engineering", joined: "2020-06-01", grade: "E5", location: "Colombo, hybrid", salary: "395000", nextReview: "2027-01-01" },
  kasun: {
    no: "LL-0417", department: "Engineering", joined: "2022-03-03", grade: "E4", title: "Senior software engineer", location: "Colombo, hybrid",
    salary: "285000", epf: "EPF-0552231", bank: ["Commercial Bank", "8001207740"], nextReview: "2027-03-01",
  },
  ayesha: { no: "LL-0291", department: "Quality", joined: "2021-01-18", grade: "E5", location: "Colombo, hybrid", salary: "360000", nextReview: "2027-01-01" },
  tharushi: { no: "LL-0598", department: "Engineering", joined: "2026-05-01", grade: "E1", location: "Kandy, remote", salary: "120000" },
  dinesh: { no: "LL-0612", department: "Engineering", joined: "2026-10-05", grade: "E2", location: "Colombo, office", salary: "165000" },
  sarah: { no: "AU-0003", department: "Leadership", joined: "2018-04-09", grade: "L1", location: "Sydney, hybrid", salary: "26000" },
  liam: { no: "AU-0011", department: "Sales", joined: "2023-07-17", grade: "S3", location: "Melbourne, hybrid", salary: "14500" },
  sahan: { no: "LL-0150", department: "IT", joined: "2019-09-02", grade: "T4", location: "Colombo, office", salary: "310000" },
  rizwan: { no: "LL-0388", department: "Engineering", joined: "2021-08-02", grade: "E3", location: "Colombo, hybrid" },
  rifkhan: { no: "LL-0640", department: "Engineering", joined: "2026-11-02", grade: "E2", location: "Colombo, hybrid", manager: "nimal" },
};

/** Kasun's documents as the mock shows them; his NIC copy is one of the 7 missing. */
export const KASUN_DOCS = [
  { title: "Employment contract", status: "signed", dated: "2022-03-01", class: "personal" },
  { title: "Promotion letter, E4", status: "signed", dated: "2025-04-02", class: "personal" },
  { title: "Updated NIC copy", status: "missing", dated: "2026-10-02", class: "personal" },
] as const;
