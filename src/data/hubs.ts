export interface HubRule {
  region: string;
  description: string;
  deadLegs: DeadLeg[];
  fixes: string[];
}

export interface DeadLeg {
  carrier: string;
  from: string;
  to: string;
  bookability: number; // 0–100
  samples?: number;
}

export interface HubConnection {
  from: string;
  to: string;
  via: string[];
  carriers: string[];
  notes?: string;
}

export const hubRules: HubRule[] = [
  {
    region: "Transpacific",
    description:
      "Always route via west coast (LAX/SFO/YVR). Direct transpacific to east coast or interior US airports are dead legs.",
    deadLegs: [
      { carrier: "QF", from: "SYD", to: "JFK", bookability: 0, samples: 235 },
      { carrier: "CX", from: "JFK", to: "HKG", bookability: 0, samples: 162 },
      { carrier: "QF", from: "DFW", to: "SYD", bookability: 0, samples: 74 },
    ],
    fixes: [
      "QF SYD-LAX (80% bookability) + AA LAX-JFK (84%)",
      "CX HKG-LAX (68%) + AA LAX-JFK (84%)",
      "Route via SFO or YVR as alternatives to LAX",
    ],
  },
  {
    region: "Middle East to Americas",
    description:
      "Route QR via HKG or LHR, never direct to US. Direct Middle East–Americas legs fail on RTW fares.",
    deadLegs: [
      { carrier: "QR", from: "DOH", to: "LAX", bookability: 10 },
      { carrier: "QR", from: "DFW", to: "DOH", bookability: 0 },
    ],
    fixes: [
      "QR DOH-HKG (78%) + CX HKG-LAX (68%)",
      "QR DOH-LHR + BA/AA LHR-JFK",
    ],
  },
  {
    region: "Intra-Asia",
    description:
      "Route via HKG for intra-Asia connections. JL NRT to South/Southeast Asia are dead legs.",
    deadLegs: [
      { carrier: "JL", from: "NRT", to: "DEL", bookability: 0 },
      { carrier: "JL", from: "NRT", to: "KUL", bookability: 0 },
      { carrier: "JL", from: "NRT", to: "SIN", bookability: 0 },
      { carrier: "JL", from: "NRT", to: "CGK", bookability: 0 },
    ],
    fixes: [
      "CX NRT-HKG (67%) + onward from HKG",
      "QR DOH-BKK (88%) for Middle East to SE Asia",
    ],
  },
  {
    region: "Oceania to Europe (Kangaroo Route)",
    description:
      "Route via SIN or HKG, never direct. QF SYD-LHR and PER-LHR are dead on RTW fares.",
    deadLegs: [
      { carrier: "QF", from: "SYD", to: "LHR", bookability: 6 },
      { carrier: "QF", from: "PER", to: "LHR", bookability: 10 },
    ],
    fixes: [
      "SQ SYD-SIN + SQ/LH SIN-LHR",
      "CX SYD-HKG + CX HKG-LHR",
    ],
  },
  {
    region: "South America to Oceania",
    description:
      "No viable South Pacific crossing on RTW fares. Route north via DFW/LAX — every priced South America–Oceania itinerary goes through the US.",
    deadLegs: [
      { carrier: "QF", from: "SCL", to: "SYD", bookability: 0, samples: 118 },
    ],
    fixes: [
      "AA SCL-DFW (73%) + AA DFW-LAX (73%) + QF LAX-SYD (54%)",
      "For Auckland, continue NZ SYD-AKL (40%) — no proven direct LAX-AKL",
    ],
  },
];

export const bookabilityByLegCount: { legs: string; successRate: number; recommendation: string }[] = [
  { legs: "3-4", successRate: 91, recommendation: "Ideal — highest bookability" },
  { legs: "5-6", successRate: 61, recommendation: "Sweet spot for complex RTW" },
  { legs: "7+", successRate: 6, recommendation: "Recommend AirTreks custom fare construction" },
];

// Known good hub connections
export const hubConnections: HubConnection[] = [
  { from: "SYD", to: "JFK", via: ["LAX"], carriers: ["QF", "AA"], notes: "QF SYD-LAX 80%, AA LAX-JFK 84%" },
  { from: "SYD", to: "LHR", via: ["SIN", "HKG"], carriers: ["SQ", "CX"], notes: "Route via Asia hub, never direct" },
  { from: "HKG", to: "JFK", via: ["LAX"], carriers: ["CX", "AA"], notes: "CX HKG-LAX 68%, AA LAX-JFK 84%" },
  { from: "DOH", to: "LAX", via: ["HKG", "LHR"], carriers: ["QR", "CX", "BA"], notes: "QR DOH-HKG 78% + CX HKG-LAX 68%" },
  { from: "NRT", to: "DEL", via: ["HKG", "BKK"], carriers: ["CX", "TG"], notes: "JL NRT-DEL is dead, route via HKG" },
  { from: "NRT", to: "SIN", via: ["HKG"], carriers: ["CX", "SQ"], notes: "JL NRT-SIN is dead, use CX via HKG" },
  { from: "BKK", to: "IST", via: ["DOH"], carriers: ["QR", "TK"], notes: "QR DOH-BKK 88%" },
  { from: "LAX", to: "NRT", via: [], carriers: ["NH", "JL", "SQ"], notes: "Direct — strong bookability" },
  { from: "LAX", to: "SYD", via: [], carriers: ["QF"], notes: "Direct — QF SYD-LAX 80%" },
  { from: "LHR", to: "JFK", via: [], carriers: ["BA", "AA"], notes: "Direct — strong bookability" },
  { from: "SIN", to: "LHR", via: [], carriers: ["SQ"], notes: "Direct — kangaroo route hub" },
  { from: "SCL", to: "SYD", via: ["DFW", "LAX"], carriers: ["AA", "QF"], notes: "QF SCL-SYD is dead (0/118). AA SCL-DFW 73% + AA DFW-LAX 73% + QF LAX-SYD 54%" },
  { from: "SCL", to: "AKL", via: ["DFW", "LAX", "SYD"], carriers: ["AA", "QF", "NZ"], notes: "Route north via US, then NZ SYD-AKL 40%. No proven direct LAX-AKL" },
];

export function isDeadLeg(from: string, to: string, carrier?: string): DeadLeg | null {
  for (const rule of hubRules) {
    for (const dl of rule.deadLegs) {
      if (
        dl.from === from.toUpperCase() &&
        dl.to === to.toUpperCase() &&
        (!carrier || dl.carrier === carrier.toUpperCase())
      ) {
        return dl;
      }
    }
  }
  return null;
}

export function findHubConnection(from: string, to: string): HubConnection | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  return (
    hubConnections.find((h) => h.from === f && h.to === t) ||
    hubConnections.find((h) => h.from === t && h.to === f) ||
    null
  );
}
