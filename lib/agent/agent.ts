import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { LOCATIONS } from "../locations";
import { callTool, newRunState, TOOL_DEFS, type GateCheck, type Recommendation } from "./tools";

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-haiku-5-5";
const MAX_TURNS = 14;

export type AgentEvent =
  | { type: "start"; model: string }
  | { type: "thought"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; result: unknown; ms: number }
  | { type: "gate"; name: string; accepted: boolean; checks: GateCheck[] }
  | { type: "final"; recommendation?: Recommendation; noParking?: { reason: string } }
  | { type: "error"; message: string };

const SYSTEM = `You are a parking-finding agent for Lviv. The user tells you where they are (or will be) and when; your job is to send them to a lot that REALLY has a free spot.

Data: ${LOCATIONS.length} monitored lots, each seen by a camera; a vision model (YOLO) counts free spots. Stored counts can be stale.

How to work:
1. Resolve the user's position to coordinates (geocode) unless they gave coordinates.
2. list_parking_lots with those coordinates. Think about which lots are worth checking: near, and with free spots in the stored data. Do not trust stored data blindly.
3. get_route for the candidate(s) to know the real drive time, and recheck_lot (fresh vision pass) on the best candidate. Only a fresh recheck counts as evidence.
4. If the rechecked lot has no free spot, or its drive time breaks the user's time limit, move to the next candidate. Say briefly why you rejected it.
5. When a candidate passes, call submit_recommendation (set max_eta_min if the user gave a time limit). If the system rejects it, read the problems, fix them with the proper tool and submit again.
6. If after rechecking all lots none has a free spot, call report_no_parking.

Rules: before each tool call write ONE short sentence in the user's language saying what you decide and why. Never invent numbers; use only tool results. Keep the final reason to 1-2 sentences. Reply in the user's language (Ukrainian if unclear).`;

export async function* runAgent(userRequest: string): AsyncGenerator<AgentEvent> {
  // AGENT_API_KEY wins so a stale ANTHROPIC_API_KEY exported in the shell can't shadow the one in .env.local.
  const apiKey = process.env.AGENT_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "Set AGENT_API_KEY (or ANTHROPIC_API_KEY) in .env.local and restart the dev server." };
    return;
  }
  const client = new Anthropic({ apiKey });
  const state = newRunState();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userRequest }];
  yield { type: "start", model: AGENT_MODEL };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model: AGENT_MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        tools: TOOL_DEFS,
        messages,
      });
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }
    messages.push({ role: "assistant", content: resp.content });

    for (const b of resp.content) if (b.type === "text" && b.text.trim()) yield { type: "thought", text: b.text.trim() };

    const calls = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!calls.length) {
      yield { type: "error", message: "The agent stopped without a verified result." };
      return;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let done = false;
    for (const call of calls) {
      yield { type: "tool_call", id: call.id, name: call.name, input: call.input };
      const t0 = Date.now();
      const out = await callTool(state, call.name, call.input as Record<string, unknown>);
      yield { type: "tool_result", id: call.id, name: call.name, result: out.result, ms: Date.now() - t0 };
      if (out.checks) {
        const accepted = !!(out.recommendation || out.noParking);
        yield { type: "gate", name: call.name, accepted, checks: out.checks };
      }
      if (out.recommendation) {
        yield { type: "final", recommendation: out.recommendation };
        done = true;
      } else if (out.noParking) {
        yield { type: "final", noParking: { reason: String((call.input as { reason?: string }).reason ?? "") } };
        done = true;
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out.result) });
    }
    if (done) return;
    messages.push({ role: "user", content: results });
  }
  yield { type: "error", message: `No verified result after ${MAX_TURNS} steps.` };
}
