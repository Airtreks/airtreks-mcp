/**
 * Cities served by more than one airport (AIR-811).
 *
 * Separate from city-aliases.ts, which maps a metro code to the one airport we
 * would ticket through. This answers a different question: given two airport
 * codes, are they the same city? A multi-stop itinerary can arrive at one and
 * depart from another — Bangkok DMK in, BKK out — and the traveller has to
 * collect bags, leave, and cross town. Nothing in an itinerary flags that.
 *
 * Only cities with genuinely separate airports are listed. A single-airport city
 * cannot produce the problem, so adding it would be noise. Distances are
 * approximate road distance between the two airports, enough to say whether a
 * transfer is a taxi ride or an expedition.
 */

export interface MetroAirport {
  code: string;
  /** The airport's own name, without the city — "Don Mueang", not "Bangkok Don Mueang". */
  name: string;
}

export interface MetroArea {
  city: string;
  airports: MetroAirport[];
  /** Rough worst-case road distance between this city's airports, in km. */
  spanKm: number;
}

export const METRO_AREAS: MetroArea[] = [
  { city: "Bangkok", spanKm: 50, airports: [{ code: "BKK", name: "Suvarnabhumi" }, { code: "DMK", name: "Don Mueang" }] },
  { city: "Tokyo", spanKm: 90, airports: [{ code: "NRT", name: "Narita" }, { code: "HND", name: "Haneda" }] },
  { city: "Osaka", spanKm: 40, airports: [{ code: "KIX", name: "Kansai" }, { code: "ITM", name: "Itami" }] },
  { city: "Seoul", spanKm: 50, airports: [{ code: "ICN", name: "Incheon" }, { code: "GMP", name: "Gimpo" }] },
  { city: "Beijing", spanKm: 70, airports: [{ code: "PEK", name: "Capital" }, { code: "PKX", name: "Daxing" }] },
  { city: "Shanghai", spanKm: 50, airports: [{ code: "PVG", name: "Pudong" }, { code: "SHA", name: "Hongqiao" }] },
  { city: "Taipei", spanKm: 40, airports: [{ code: "TPE", name: "Taoyuan" }, { code: "TSA", name: "Songshan" }] },
  { city: "Jakarta", spanKm: 35, airports: [{ code: "CGK", name: "Soekarno-Hatta" }, { code: "HLP", name: "Halim" }] },
  { city: "Kuala Lumpur", spanKm: 60, airports: [{ code: "KUL", name: "KLIA" }, { code: "SZB", name: "Subang" }] },
  { city: "Dubai", spanKm: 60, airports: [{ code: "DXB", name: "International" }, { code: "DWC", name: "Al Maktoum" }] },
  { city: "Istanbul", spanKm: 70, airports: [{ code: "IST", name: "Istanbul" }, { code: "SAW", name: "Sabiha Gokcen" }] },
  { city: "London", spanKm: 110, airports: [{ code: "LHR", name: "Heathrow" }, { code: "LGW", name: "Gatwick" }, { code: "STN", name: "Stansted" }, { code: "LTN", name: "Luton" }, { code: "LCY", name: "City" }] },
  { city: "Paris", spanKm: 100, airports: [{ code: "CDG", name: "Charles de Gaulle" }, { code: "ORY", name: "Orly" }, { code: "BVA", name: "Beauvais" }] },
  { city: "Milan", spanKm: 100, airports: [{ code: "MXP", name: "Malpensa" }, { code: "LIN", name: "Linate" }, { code: "BGY", name: "Bergamo" }] },
  { city: "Rome", spanKm: 60, airports: [{ code: "FCO", name: "Fiumicino" }, { code: "CIA", name: "Ciampino" }] },
  { city: "Stockholm", spanKm: 110, airports: [{ code: "ARN", name: "Arlanda" }, { code: "BMA", name: "Bromma" }, { code: "NYO", name: "Skavsta" }] },
  { city: "Moscow", spanKm: 90, airports: [{ code: "SVO", name: "Sheremetyevo" }, { code: "DME", name: "Domodedovo" }, { code: "VKO", name: "Vnukovo" }] },
  { city: "Berlin", spanKm: 30, airports: [{ code: "BER", name: "Brandenburg" }, { code: "SXF", name: "Schonefeld" }] },
  { city: "New York", spanKm: 60, airports: [{ code: "JFK", name: "JFK" }, { code: "EWR", name: "Newark" }, { code: "LGA", name: "LaGuardia" }] },
  { city: "Chicago", spanKm: 40, airports: [{ code: "ORD", name: "O'Hare" }, { code: "MDW", name: "Midway" }] },
  { city: "Washington DC", spanKm: 60, airports: [{ code: "IAD", name: "Dulles" }, { code: "DCA", name: "Reagan National" }, { code: "BWI", name: "Baltimore" }] },
  { city: "Houston", spanKm: 45, airports: [{ code: "IAH", name: "Intercontinental" }, { code: "HOU", name: "Hobby" }] },
  { city: "Los Angeles", spanKm: 70, airports: [{ code: "LAX", name: "LAX" }, { code: "BUR", name: "Burbank" }, { code: "LGB", name: "Long Beach" }, { code: "SNA", name: "John Wayne" }] },
  { city: "San Francisco Bay Area", spanKm: 70, airports: [{ code: "SFO", name: "San Francisco" }, { code: "OAK", name: "Oakland" }, { code: "SJC", name: "San Jose" }] },
  { city: "Toronto", spanKm: 30, airports: [{ code: "YYZ", name: "Pearson" }, { code: "YTZ", name: "Billy Bishop" }] },
  { city: "Sao Paulo", spanKm: 110, airports: [{ code: "GRU", name: "Guarulhos" }, { code: "CGH", name: "Congonhas" }, { code: "VCP", name: "Viracopos" }] },
  { city: "Rio de Janeiro", spanKm: 25, airports: [{ code: "GIG", name: "Galeao" }, { code: "SDU", name: "Santos Dumont" }] },
  { city: "Buenos Aires", spanKm: 45, airports: [{ code: "EZE", name: "Ezeiza" }, { code: "AEP", name: "Aeroparque" }] },
  { city: "Melbourne", spanKm: 60, airports: [{ code: "MEL", name: "Tullamarine" }, { code: "AVV", name: "Avalon" }] },
  { city: "Belo Horizonte", spanKm: 40, airports: [{ code: "CNF", name: "Confins" }, { code: "PLU", name: "Pampulha" }] },
];

const BY_AIRPORT = new Map<string, { area: MetroArea; airport: MetroAirport }>();
for (const area of METRO_AREAS) {
  for (const airport of area.airports) {
    BY_AIRPORT.set(airport.code, { area, airport });
  }
}

export interface SameCityPair {
  city: string;
  spanKm: number;
  from: MetroAirport;
  to: MetroAirport;
}

/**
 * Two airports in the same city, or null.
 *
 * Null covers both "same airport" and "different cities". A different city is
 * not a problem to report: if an itinerary arrives London and leaves Paris, the
 * customer asked for that — it is an open jaw, not a mistake.
 */
export function sameCityDifferentAirport(from: string, to: string): SameCityPair | null {
  const a = BY_AIRPORT.get(from.trim().toUpperCase());
  const b = BY_AIRPORT.get(to.trim().toUpperCase());
  if (!a || !b) return null;
  if (a.airport.code === b.airport.code) return null;
  if (a.area.city !== b.area.city) return null;
  return { city: a.area.city, spanKm: a.area.spanKm, from: a.airport, to: b.airport };
}
