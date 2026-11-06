// Broad carrier database — beyond alliances. Every carrier a consultant would consider.

export type CarrierType = "alliance" | "gulf-bridge" | "lcc" | "regional" | "flag-carrier";

export interface CarrierInfo {
  code: string;
  name: string;
  type: CarrierType;
  alliance?: string;
  hub?: string;
  regions: string[];      // regions this carrier is strong in
  strengths?: string;
}

// Gulf bridge carriers — the glue of custom itineraries
export const gulfBridgeCarriers: CarrierInfo[] = [
  { code: "EK", name: "Emirates", type: "gulf-bridge", hub: "DXB", regions: ["middle-east", "asia", "europe", "africa", "oceania", "americas"], strengths: "Most connected hub in the world. Premium product. Flies everywhere." },
  { code: "QR", name: "Qatar Airways", type: "gulf-bridge", hub: "DOH", alliance: "oneworld", regions: ["middle-east", "asia", "europe", "africa", "americas"], strengths: "Qsuite business class. Strong to Asia and Africa." },
  { code: "EY", name: "Etihad", type: "gulf-bridge", hub: "AUH", regions: ["middle-east", "asia", "europe", "africa", "oceania"], strengths: "Often cheapest Gulf option. Good to Australia." },
  { code: "TK", name: "Turkish Airlines", type: "gulf-bridge", hub: "IST", alliance: "Star Alliance", regions: ["europe", "middle-east", "asia", "africa", "americas"], strengths: "300+ destinations. Best value Europe-Africa-Asia bridge. IST is a superconnector." },
];

// LCCs by region
export const lccCarriers: CarrierInfo[] = [
  // Intra-Asia
  { code: "AK", name: "AirAsia", type: "lcc", hub: "KUL", regions: ["asia"], strengths: "Dominates SE Asia short-haul. KUL hub." },
  { code: "FD", name: "Thai AirAsia", type: "lcc", hub: "DMK", regions: ["asia"], strengths: "Bangkok DMK base. Cheap intra-SE Asia." },
  { code: "QZ", name: "Indonesia AirAsia", type: "lcc", hub: "CGK", regions: ["asia"], strengths: "Indonesia domestic and regional." },
  { code: "D7", name: "AirAsia X", type: "lcc", hub: "KUL", regions: ["asia", "oceania"], strengths: "Long-haul LCC. KUL-SYD, KUL-NRT, KUL-HND." },
  { code: "TR", name: "Scoot", type: "lcc", hub: "SIN", regions: ["asia", "oceania"], strengths: "SIN hub. SQ subsidiary. Good for SIN connections." },
  { code: "VJ", name: "VietJet", type: "lcc", hub: "SGN", regions: ["asia"], strengths: "Vietnam domestic + SE Asia regional." },
  { code: "JT", name: "Lion Air", type: "lcc", hub: "CGK", regions: ["asia"], strengths: "Indonesia's largest domestic. Cheap but chaotic." },
  { code: "5J", name: "Cebu Pacific", type: "lcc", hub: "MNL", regions: ["asia"], strengths: "Philippines domestic + SE Asia." },
  { code: "MM", name: "Peach", type: "lcc", hub: "KIX", regions: ["asia"], strengths: "Japan domestic LCC. ANA subsidiary." },
  { code: "TW", name: "T'way Air", type: "lcc", hub: "ICN", regions: ["asia"], strengths: "Korea-Japan-SE Asia budget." },
  // Intra-Europe
  { code: "FR", name: "Ryanair", type: "lcc", hub: "STN", regions: ["europe"], strengths: "Cheapest in Europe. Secondary airports." },
  { code: "U2", name: "easyJet", type: "lcc", hub: "LGW", regions: ["europe"], strengths: "Better airports than Ryanair. Good network." },
  { code: "W6", name: "Wizz Air", type: "lcc", hub: "BUD", regions: ["europe"], strengths: "Central/Eastern Europe specialist. Expanding." },
  { code: "VY", name: "Vueling", type: "lcc", hub: "BCN", regions: ["europe"], strengths: "Spain/Mediterranean. IAG group (BA parent)." },
  { code: "DY", name: "Norwegian", type: "lcc", hub: "OSL", regions: ["europe"], strengths: "Scandinavia specialist. Some long-haul." },
  // Intra-Americas
  { code: "WN", name: "Southwest", type: "lcc", hub: "DAL", regions: ["americas"], strengths: "US domestic. Bags are no longer free. Assigned seating. No change fees." },
  { code: "B6", name: "JetBlue", type: "lcc", hub: "JFK", regions: ["americas"], strengths: "US east coast + Caribbean. Mint biz class." },
  { code: "F9", name: "Frontier", type: "lcc", hub: "DEN", regions: ["americas"], strengths: "Ultra-low-cost US domestic." },
  { code: "Y4", name: "Volaris", type: "lcc", hub: "MEX", regions: ["americas"], strengths: "Mexico domestic + US-Mexico." },
  // Oceania
  { code: "JQ", name: "Jetstar", type: "lcc", hub: "MEL", regions: ["oceania", "asia"], strengths: "AU-NZ-Fiji-Bali. Qantas subsidiary." },
];

// Regional specialists — not LCCs, strong in specific corridors
export const regionalCarriers: CarrierInfo[] = [
  { code: "ET", name: "Ethiopian Airlines", type: "regional", hub: "ADD", alliance: "Star Alliance", regions: ["africa", "middle-east", "asia", "europe"], strengths: "Best Africa network by far. ADD hub connects everywhere in Africa. Often cheapest to/within Africa." },
  { code: "KE", name: "Korean Air", type: "regional", hub: "ICN", alliance: "SkyTeam", regions: ["asia", "americas", "oceania"], strengths: "Seoul hub. Strong transpacific. Good product." },
  { code: "GA", name: "Garuda Indonesia", type: "regional", hub: "CGK", regions: ["asia", "oceania"], strengths: "Indonesia specialist. SkyTeam. CGK hub." },
  { code: "VN", name: "Vietnam Airlines", type: "regional", hub: "SGN", alliance: "SkyTeam", regions: ["asia"], strengths: "Indochina specialist. Good value HAN/SGN hub." },
  { code: "SV", name: "Saudia", type: "regional", hub: "JED", alliance: "SkyTeam", regions: ["middle-east", "asia", "africa"], strengths: "Cheap Middle East connector. JED/RUH hubs." },
  { code: "KQ", name: "Kenya Airways", type: "regional", hub: "NBO", alliance: "SkyTeam", regions: ["africa"], strengths: "East Africa hub. NBO gateway to safaris." },
  { code: "SA", name: "South African Airways", type: "regional", hub: "JNB", alliance: "Star Alliance", regions: ["africa"], strengths: "Southern Africa hub. JNB gateway." },
  { code: "RW", name: "Royal Air Maroc", type: "regional", hub: "CMN", alliance: "oneworld", regions: ["africa", "europe"], strengths: "North/West Africa gateway. CMN hub." },
  { code: "PX", name: "Air Niugini", type: "regional", hub: "POM", regions: ["oceania"], strengths: "Papua New Guinea. Only option for POM." },
  { code: "FJ", name: "Fiji Airways", type: "regional", hub: "NAN", regions: ["oceania"], strengths: "South Pacific islands. NAN hub. Only real option for Fiji." },
  { code: "WS", name: "WestJet", type: "regional", hub: "YYC", regions: ["americas"], strengths: "Canada domestic + sun destinations." },
];

// Flag carriers useful standalone (not in alliances or useful outside alliance context)
export const flagCarriers: CarrierInfo[] = [
  { code: "LA", name: "LATAM", type: "flag-carrier", hub: "SCL", regions: ["americas"], strengths: "Best South America network. Left oneworld 2020. Still dominant in SA." },
  { code: "AF", name: "Air France", type: "flag-carrier", hub: "CDG", alliance: "SkyTeam", regions: ["europe", "africa", "americas"], strengths: "Paris hub. Great to Africa and Caribbean." },
  { code: "KL", name: "KLM", type: "flag-carrier", hub: "AMS", alliance: "SkyTeam", regions: ["europe", "africa", "americas", "asia"], strengths: "Amsterdam hub. Strong Africa/Caribbean/Asia network." },
  { code: "VS", name: "Virgin Atlantic", type: "flag-carrier", hub: "LHR", regions: ["europe", "americas", "asia"], strengths: "LHR-US routes. Good premium product. SkyTeam partner." },
  { code: "DL", name: "Delta", type: "flag-carrier", hub: "ATL", alliance: "SkyTeam", regions: ["americas", "europe", "asia"], strengths: "Huge US domestic + good transatlantic. ATL/JFK/MSP/SEA hubs." },
  { code: "HA", name: "Hawaiian Airlines", type: "flag-carrier", hub: "HNL", regions: ["americas", "oceania", "asia"], strengths: "Hawaii hub. HNL-NRT, HNL-SYD. Alaska Airlines merged." },
];

// All carriers combined
export const allCarriers: CarrierInfo[] = [
  ...gulfBridgeCarriers,
  ...lccCarriers,
  ...regionalCarriers,
  ...flagCarriers,
];

export function findCarrierInfo(code: string): CarrierInfo | null {
  return allCarriers.find((c) => c.code === code.toUpperCase()) || null;
}

export function carriersByRegion(region: string): CarrierInfo[] {
  const r = region.toLowerCase();
  return allCarriers.filter((c) => c.regions.some((cr) => cr.includes(r)));
}

export function carriersByType(type: CarrierType): CarrierInfo[] {
  return allCarriers.filter((c) => c.type === type);
}
