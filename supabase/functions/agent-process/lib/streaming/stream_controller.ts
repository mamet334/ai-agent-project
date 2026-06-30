import { MAEFExecutionResult } from '../maef/maef_contract.ts';
import { corsHeaders, getStreamResponse } from '../stream_handler.ts';

export const streamController = {
    pipe(result: MAEFExecutionResult, rctx: any): Response {

        if (result.mode === 'STREAM') {
            if (result.type === 'BLOCKED') {
                const blockedStream = new ReadableStream({
                  start(controller) {
                    const encoder = new TextEncoder();
                    const data = JSON.stringify({ choices: [{ delta: { content: result.blockedMsg } }] });
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                  }
                });
                return new Response(blockedStream, {
                  headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
                });
            } else if (result.type === 'LLM') {
                return getStreamResponse(result.prompt || '', result.systemContext || '', result.history || [], result.payload, rctx);
            }
        }
        
        if (result.mode === 'DIRECT') {
            return new Response(JSON.stringify(result.aiResponse), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        
        return new Response(JSON.stringify({ error: "Unknown execution mode" }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};
