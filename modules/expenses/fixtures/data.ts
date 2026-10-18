// Fictional demo claims for Lumen Labs (all merchants and amounts are made up; "(demo)" marks them).
export const CATEGORIES: { entity: "lk" | "au"; key: string; name: string; currency: string; limit: string; receiptOver: string; health?: boolean }[] = [
  { entity: "lk", key: "travel", name: "Travel", currency: "LKR", limit: "25000", receiptOver: "2000" },
  { entity: "lk", key: "meals", name: "Meals", currency: "LKR", limit: "5000", receiptOver: "1500" },
  { entity: "lk", key: "equipment", name: "Equipment", currency: "LKR", limit: "60000", receiptOver: "0" },
  { entity: "lk", key: "training", name: "Training", currency: "LKR", limit: "100000", receiptOver: "0" },
  { entity: "lk", key: "medical", name: "Medical", currency: "LKR", limit: "20000", receiptOver: "0", health: true },
  { entity: "au", key: "travel", name: "Travel", currency: "AUD", limit: "500", receiptOver: "50" },
  { entity: "au", key: "meals", name: "Meals", currency: "AUD", limit: "80", receiptOver: "30" },
];

type Claim = { who: string; category: string; on: string; merchant: string; what: string; amount: string; status: string; receipt: string; manager?: string; finance?: string; payVia?: string; period?: string; paid?: [string, string] };
export const CLAIMS: Claim[] = [
  { who: "kasun", category: "travel", on: "2026-10-14", merchant: "CityHop Taxi (demo)", what: "Taxi to the Contoso Portal workshop and back", amount: "3450", status: "submitted", receipt: "cityhop-1014.jpg" },
  { who: "ayesha", category: "meals", on: "2026-10-13", merchant: "Lotus Leaf Cafe (demo)", what: "Team lunch after the Reports v2 release", amount: "6200", status: "submitted", receipt: "lotus-leaf-1013.jpg" },
  { who: "dinesh", category: "medical", on: "2026-10-12", merchant: "Harbour Clinic (demo)", what: "Doctor's visit and prescription", amount: "4800", status: "submitted", receipt: "harbour-clinic-1012.pdf" },
  { who: "nimal", category: "equipment", on: "2026-10-09", merchant: "Circuit Corner (demo)", what: "USB-C dock for the second monitor", amount: "18900", status: "manager_approved", receipt: "circuit-corner-1009.jpg", manager: "maya" },
  { who: "tharushi", category: "training", on: "2026-09-28", merchant: "CloudCert Academy (demo)", what: "Cloud practitioner exam voucher", amount: "45000", status: "approved", receipt: "cloudcert-0928.pdf", manager: "maya", finance: "sahan", payVia: "payroll", period: "2026-10" },
  { who: "liam", category: "travel", on: "2026-10-02", merchant: "Harbourside Parking (demo)", what: "Parking for the Northwind HR meeting", amount: "42.50", status: "paid", receipt: "parking-1002.jpg", manager: "sarah", finance: "sahan", payVia: "bank", paid: ["2026-10-08", "Demo transfer 4471 (fictional)"] },
];

export const RECEIPT = { who: "nimal", filename: "brewline-1015.jpg", text: "Brewline Coffee (demo)\n15 Oct 2026\n2 x Flat white\nTotal LKR 1,380.00\nThank you" };
