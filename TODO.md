# TODO: Fix "subcat-agent-engineer" node not found error

## Steps
- [x] 1. Audit semua `links.push()` dan ganti dengan `safeLink()`
- [x] 2. Audit urutan pembuatan node vs link — pindahkan ke 3-phase (register IDs, push ALL nodes, push ALL links)
- [x] 3. Pre-compute ALL possible subcluster IDs from ACTUAL DATA before building any nodes
- [x] 4. Add fallback guards in ActivityGraph.jsx link callbacks (null checks)
- [x] 5. getNodeColor already has proper `if (!node) return FALLBACK_COLOR` guard

## Root Cause & Fix

### Problem
`registerSubcluster('subcat-agent-engineer', ...)` was called INSIDE the chat loop (`chats.forEach()`), but the node was only pushed to arrays in a separate pass AFTER the loop. The `safeLink(links, nodes, 'chat-xxx', 'subcat-agent-engineer')` ran BEFORE the `subcat-agent-engineer` node existed.

### Solution: 3-Phase Architecture

**Phase 1 — Register all subcluster IDs upfront:**
- Pre-compute ALL possible subcluster IDs from memories, documents, AND chats data
- `allPossibleSubclusterIds.add('subcat-agent-engineer')` from `chats.forEach()` based on `workspace_type`
- Build `allSubclusterDefs` Map with definitions for ALL possible IDs

**Phase 2 — Push ALL nodes first (no links):**
1. Core node
2. Primary clusters
3. All subclusters (static + dynamic pre-computed)
4. Pipeline services
5. Memory data nodes
6. Document data nodes
7. Chat data nodes

**Phase 3 — Push ALL links (every node already exists):**
1. Primary cluster → Core
2. Subcluster → Parent
3. Pipeline → Core + Telemetry
4. Memory → Subcluster + causal links
5. Document → Subcluster
6. Chat → Subcluster

**SafeLink fallback:** `safeLink()` will skip with a warning if source/target not found (still present but should never trigger now)

**ActivityGraph.jsx fallback:** All link callbacks now check `!link || !link.source || !link.target` before accessing properties
