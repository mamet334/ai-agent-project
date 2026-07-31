-- =====================================================================================
-- MAMET AI - SUBGRAPH EXTRACTOR (MEMORY MANAGER V2)
-- =====================================================================================
-- Implementasi Execution Engine untuk Cognitive Context Pipeline
-- Terintegrasi dengan CEBL (Context Execution Binding Layer)

CREATE OR REPLACE FUNCTION extract_cognitive_subgraph(
    p_user_id UUID,
    p_keywords TEXT[],
    p_intent_mode TEXT,
    p_max_nodes INT,
    p_max_edges INT,
    p_traversal_depth INT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_nodes JSONB[] := ARRAY[]::JSONB[];
    v_edges JSONB[] := ARRAY[]::JSONB[];
    v_visited_nodes UUID[] := ARRAY[]::UUID[];
    v_visited_edges TEXT[] := ARRAY[]::TEXT[];
    v_current_level UUID[];
    v_next_level UUID[];
    v_depth INT := 0;
    v_exhausted BOOLEAN := FALSE;
    v_root_record RECORD;
    v_edge_record RECORD;
    v_node_record RECORD;
BEGIN
    -- =====================================================================================
    -- TAHAP A: INTENT FILTER & CANDIDATE NODES (Mencegah Ledakan Graf)
    -- =====================================================================================
    -- Kami mencari akar (roots) langsung dari active view terlebih dahulu.
    -- Semakin banyak keyword yang cocok, semakin tinggi skornya.
    FOR v_root_record IN 
        SELECT id, summary, memory_type, metadata, created_at,
               (SELECT count(*) FROM unnest(p_keywords) kw WHERE summary ILIKE '%' || kw || '%') AS score
        FROM active_user_memories
        WHERE user_id = p_user_id
        ORDER BY score DESC, created_at DESC
        LIMIT p_max_nodes
    LOOP
        -- HARD BUDGET STOP CHECK
        IF array_length(v_nodes, 1) >= p_max_nodes THEN
            v_exhausted := TRUE;
            EXIT;
        END IF;
        
        v_nodes := array_append(v_nodes, jsonb_build_object(
            'id', v_root_record.id,
            'summary', v_root_record.summary,
            'memory_type', v_root_record.memory_type,
            'metadata', v_root_record.metadata,
            'score', v_root_record.score,
            'created_at', v_root_record.created_at,
            'is_root', TRUE
        ));
        -- Menandai node sebagai sudah dikunjungi (Cycle Detection)
        v_visited_nodes := array_append(v_visited_nodes, v_root_record.id);
    END LOOP;

    -- =====================================================================================
    -- TAHAP B: GRAPH TRAVERSAL (Rekursif Dinamis Terkendali)
    -- =====================================================================================
    -- Hanya dijalankan untuk mode yang diwajibkan oleh CEBL merayapi masa lalu.
    IF (p_intent_mode = 'DELTA' OR p_intent_mode = 'ANALYTIC') AND NOT v_exhausted AND array_length(v_visited_nodes, 1) > 0 THEN
        v_current_level := v_visited_nodes;
        
        WHILE v_depth < p_traversal_depth AND array_length(v_current_level, 1) > 0 AND NOT v_exhausted LOOP
            v_next_level := ARRAY[]::UUID[];
            
            -- Mencari Edge Relasional (Mundur dan Maju di Temporal Graph)
            FOR v_edge_record IN
                SELECT source_memory_id, target_memory_id, relation_type, reason_type, confidence
                FROM memory_relations
                WHERE target_memory_id = ANY(v_current_level)
                   OR source_memory_id = ANY(v_current_level)
            LOOP
                -- HARD BUDGET STOP: Edges
                IF array_length(v_edges, 1) >= p_max_edges THEN
                    v_exhausted := TRUE;
                    EXIT;
                END IF;
                
                -- Deteksi Duplikasi Edge
                IF NOT (v_edge_record.source_memory_id::TEXT || '-' || v_edge_record.target_memory_id::TEXT) = ANY(v_visited_edges) THEN
                    v_edges := array_append(v_edges, jsonb_build_object(
                        'source_memory_id', v_edge_record.source_memory_id,
                        'target_memory_id', v_edge_record.target_memory_id,
                        'relation_type', v_edge_record.relation_type,
                        'reason_type', v_edge_record.reason_type,
                        'confidence', v_edge_record.confidence
                    ));
                    v_visited_edges := array_append(v_visited_edges, v_edge_record.source_memory_id::TEXT || '-' || v_edge_record.target_memory_id::TEXT);
                END IF;
                
                -- CYCLE DETECTION & Node Traversal (Target)
                IF NOT (v_edge_record.target_memory_id = ANY(v_visited_nodes)) THEN
                    -- HARD BUDGET STOP: Nodes
                    IF array_length(v_nodes, 1) >= p_max_nodes THEN
                        v_exhausted := TRUE;
                        EXIT;
                    END IF;
                    
                    SELECT id, summary, memory_type, metadata, created_at
                    INTO v_node_record
                    FROM user_memories WHERE id = v_edge_record.target_memory_id;
                    
                    IF FOUND THEN
                        v_nodes := array_append(v_nodes, jsonb_build_object(
                            'id', v_node_record.id,
                            'summary', v_node_record.summary,
                            'memory_type', v_node_record.memory_type,
                            'metadata', v_node_record.metadata,
                            'score', 0,
                            'created_at', v_node_record.created_at,
                            'is_root', FALSE
                        ));
                        v_visited_nodes := array_append(v_visited_nodes, v_node_record.id);
                        v_next_level := array_append(v_next_level, v_node_record.id);
                    END IF;
                END IF;

                -- CYCLE DETECTION & Node Traversal (Source)
                IF NOT (v_edge_record.source_memory_id = ANY(v_visited_nodes)) THEN
                    -- HARD BUDGET STOP: Nodes
                    IF array_length(v_nodes, 1) >= p_max_nodes THEN
                        v_exhausted := TRUE;
                        EXIT;
                    END IF;
                    
                    SELECT id, summary, memory_type, metadata, created_at
                    INTO v_node_record
                    FROM user_memories WHERE id = v_edge_record.source_memory_id;
                    
                    IF FOUND THEN
                        v_nodes := array_append(v_nodes, jsonb_build_object(
                            'id', v_node_record.id,
                            'summary', v_node_record.summary,
                            'memory_type', v_node_record.memory_type,
                            'metadata', v_node_record.metadata,
                            'score', 0,
                            'created_at', v_node_record.created_at,
                            'is_root', FALSE
                        ));
                        v_visited_nodes := array_append(v_visited_nodes, v_node_record.id);
                        v_next_level := array_append(v_next_level, v_node_record.id);
                    END IF;
                END IF;

            END LOOP;
            
            v_current_level := v_next_level;
            v_depth := v_depth + 1;
        END LOOP;
    END IF;

    -- =====================================================================================
    -- RETRIEVAL STATISTICS METADATA (Untuk Evaluator & Cost Governor Agent)
    -- =====================================================================================
    RETURN jsonb_build_object(
        'nodes', COALESCE(to_jsonb(v_nodes), '[]'::jsonb),
        'edges', COALESCE(to_jsonb(v_edges), '[]'::jsonb),
        'stats', jsonb_build_object(
            'nodes_used', COALESCE(array_length(v_nodes, 1), 0),
            'edges_used', COALESCE(array_length(v_edges, 1), 0),
            'depth_reached', v_depth,
            'budget_exhausted', v_exhausted
        )
    );
END;
$$;
