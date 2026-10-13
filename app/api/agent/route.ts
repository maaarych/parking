import { runAgent } from "@/lib/agent/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Dev-only: streams the agent's steps (Server-Sent Events). Needs ANTHROPIC_API_KEY and the local Python analyzer. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("disabled in production", { status: 403 });
  const { request } = (await req.json()) as { request?: string };
  if (!request?.trim()) return new Response("empty request", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgent(request.trim().slice(0, 1000))) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
