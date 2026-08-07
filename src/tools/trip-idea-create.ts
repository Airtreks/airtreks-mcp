import { z } from "zod";
import { isConfigured, createTripIdea } from "../lib/apex-client.js";
import { planRoute } from "./plan-route.js";
import { TRIP_PLANNER_URL } from "../lib/links.js";

export const tripIdeaCreateSchema = {
  // Customer info
  email: z.string().describe("Customer email address (required)"),
  name: z.string().optional().describe("Customer full name"),
  phone: z.string().optional().describe("Customer phone number"),

  // Trip details
  cities: z.array(z.string()).describe("Ordered list of IATA city/airport codes"),
  dates: z.array(z.string()).optional().describe("Departure dates for each leg (ISO format, e.g. '2026-09-15')"),
  passengers: z.number().optional().describe("Number of passengers (default 1)"),
  cabin: z.enum(["economy", "premium", "business"]).optional().describe("Cabin class preference"),
  budget: z.enum(["budget", "mid", "premium", "business"]).optional().describe("Budget tier"),

  // Preferences
  flexibleDates: z.boolean().optional().describe("Are travel dates flexible?"),
  preferences: z.array(z.string()).optional().describe("Travel preferences: 'no-lcc', 'lounge-access', 'short-layovers', 'surface-ok'"),
  notes: z.string().optional().describe("Additional notes or special requests from the customer"),

  // Agent context — what the AI agent learned during the conversation
  agentContext: z.string().optional().describe("Summary of what the AI agent learned about this trip (auto-generated routing analysis, customer preferences discussed, etc.)"),
};

export async function tripIdeaCreate(args: {
  email: string;
  name?: string;
  phone?: string;
  cities: string[];
  dates?: string[];
  passengers?: number;
  cabin?: string;
  budget?: string;
  flexibleDates?: boolean;
  preferences?: string[];
  notes?: string;
  agentContext?: string;
}) {
  const {
    email, name, phone,
    cities, dates, passengers = 1, cabin = "economy", budget,
    flexibleDates, preferences, notes, agentContext,
  } = args;

  if (cities.length < 2) {
    return { error: "Need at least 2 cities to create a trip idea." };
  }

  // Check APEX connectivity
  if (!isConfigured()) {
    return {
      error: "APEX integration not configured. Trip idea cannot be created automatically.",
      fallback: {
        message: "Please submit your trip request directly at the link below. Include your route and travel dates.",
        route: cities.map((c) => c.toUpperCase()).join(" -> "),
        bookWithAirTreks: TRIP_PLANNER_URL,
      },
    };
  }

  // Run plan_route to generate routing intelligence
  const routeAnalysis = planRoute({
    cities,
    budget,
    preferences,
    pax: passengers,
  });

  // Build notes for the consultant
  const noteLines: string[] = [];
  noteLines.push("--- MCP Agent Lead ---");
  noteLines.push(`Channel: AI Agent (MCP)`);

  // Route analysis summary
  const analysis = routeAnalysis as Record<string, any>;
  if (analysis.recommended) {
    noteLines.push(`\nRecommended approach: ${analysis.recommended.approach} (${analysis.recommended.confidence} confidence)`);
    noteLines.push(`Reason: ${analysis.recommended.reason}`);
  }
  if (analysis.direction) {
    noteLines.push(`Direction: ${analysis.direction}${analysis.backtracking ? " (backtracking detected)" : ""}`);
  }

  // Custom build details
  const customBuild = analysis.customBuild as Record<string, any> | undefined;
  if (customBuild) {
    if (customBuild.complexity) {
      noteLines.push(`\nComplexity: ${customBuild.complexity}`);
    }
    if (customBuild.consultantValueSummary) {
      noteLines.push(`Consultant value: ${customBuild.consultantValueSummary}`);
    }
    // Segment-by-segment carrier recommendations
    const segments = customBuild.segments as any[] | undefined;
    if (segments?.length) {
      noteLines.push(`\nCarrier recommendations:`);
      for (const seg of segments) {
        const cv = seg.consultantValue === "high" ? " ** HIGH VALUE **" : "";
        noteLines.push(`  Leg ${seg.leg}: ${seg.from}-${seg.to} -> ${seg.carrier.code} (${seg.carrier.name})${cv}`);
        if (seg.surfaceNote) {
          noteLines.push(`    Surface option: ${seg.surfaceNote}`);
        }
      }
    }
    // Surface sectors
    const surfaces = customBuild.surfaceSectors as any[] | undefined;
    if (surfaces?.length) {
      noteLines.push(`\nSurface sector opportunities:`);
      for (const s of surfaces) {
        noteLines.push(`  ${s.insteadOf}: ${s.savings}`);
      }
    }
  }

  // Alliance feasibility
  const af = analysis.allianceFeasibility as Record<string, any> | undefined;
  if (af) {
    noteLines.push(`\nAlliance feasibility:`);
    if (af.starAlliance) noteLines.push(`  Star Alliance: ${af.starAlliance.summary}`);
    if (af.oneworld) noteLines.push(`  oneworld: ${af.oneworld.summary}`);
  }

  // Customer preferences
  if (budget) noteLines.push(`\nBudget: ${budget}`);
  if (cabin !== "economy") noteLines.push(`Cabin: ${cabin}`);
  if (flexibleDates) noteLines.push("Dates are flexible");
  if (preferences?.length) noteLines.push(`Preferences: ${preferences.join(", ")}`);
  if (notes) noteLines.push(`\nCustomer notes: ${notes}`);
  if (agentContext) noteLines.push(`\nAgent context: ${agentContext}`);

  // Parse name
  const nameParts = (name || "").split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  try {
    const result = await createTripIdea({
      firstName,
      lastName,
      email,
      phone,
      stops: cities.map((c) => c.toUpperCase()),
      dates,
      passengers,
      cabin,
      notes: noteLines.join("\n"),
      flexibleDates,
    });

    return {
      success: true,
      tripIdeaId: result.id,
      message: `Trip idea #${result.id} created in APEX. An AirTreks consultant will review your ${cities.length - 1}-leg itinerary and reach out within 1 business day.`,
      route: cities.map((c) => c.toUpperCase()).join(" -> "),
      consultant: "A consultant will be assigned based on route expertise and availability.",
      whatHappensNext: [
        "An AirTreks consultant receives your full routing analysis and preferences",
        "They'll review the carrier recommendations and optimize pricing",
        "You'll get a detailed quote with exact fares within 1 business day",
        "The consultant can adjust the routing based on your feedback",
      ],
      tripDetails: {
        passengers,
        cabin,
        flexibleDates: !!flexibleDates,
        recommended: analysis.recommended,
      },
      apexUrl: result.id ? `https://kite.bootsnall.com/tripideas/${result.id}` : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to create trip idea: ${err.message}`,
      fallback: {
        message: "The automated system encountered an issue. Please submit your trip request directly.",
        route: cities.map((c) => c.toUpperCase()).join(" -> "),
        bookWithAirTreks: TRIP_PLANNER_URL,
      },
    };
  }
}
