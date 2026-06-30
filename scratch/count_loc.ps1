$files = @(
    "supabase/functions/agent-process/lib/rag/context_pipeline.ts",
    "supabase/functions/agent-process/lib/rag/document_search.ts",
    "supabase/functions/agent-process/lib/rag/embedding.ts",
    "supabase/functions/agent-process/lib/rag/engineer_context.ts",
    "supabase/functions/agent-process/lib/rag/project_memory.ts",
    "supabase/functions/agent-process/lib/rag/rag_pipeline.ts",
    "supabase/functions/agent-process/lib/rag/types.ts",
    "supabase/functions/agent-process/index.ts",
    "supabase/functions/agent-process/lib/llm_orchestrator.ts",
    "supabase/functions/agent-process/lib/stream_handler.ts",
    "supabase/functions/agent-process/lib/provider_manager.ts"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $lines = (Get-Content $f | Measure-Object -Line).Lines
        Write-Host "$f : $lines"
    } else {
        Write-Host "$f : NOT FOUND"
    }
}
