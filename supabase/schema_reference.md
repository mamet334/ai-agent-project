# Supabase Database Schema Reference

## Table `history`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `tool_name` | `text` |  |
| `prompt` | `text` |  |
| `result` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `scheduled_tasks`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `title` | `text` |  |
| `prompt` | `text` |  |
| `tools` | `jsonb` | Nullable |
| `interval_hours` | `int4` | Nullable |
| `is_active` | `bool` | Nullable |
| `last_run_at` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | Nullable |

## Table `chats`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `title` | `text` |  |
| `messages` | `jsonb` | Nullable |
| `workspace_id` | `uuid` | Nullable (Ref: knowledge_spaces.id) |
| `workspace_type` | `text` | Default: 'OWNER' |
| `created_at` | `timestamptz` | Nullable |
| `updated_at` | `timestamptz` | Nullable |

## Table `documents`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `title` | `text` |  |
| `created_at` | `timestamptz` |  |
| `space_id` | `uuid` |  |

## Table `document_chunks`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `document_id` | `uuid` |  |
| `content` | `text` |  |
| `embedding` | `vector` | Nullable |

## Table `agent_logs`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` | Nullable |
| `event_type` | `text` |  |
| `provider` | `text` | Nullable |
| `message` | `text` |  |
| `metadata` | `jsonb` | Nullable |
| `created_at` | `timestamptz` | Nullable |

## Table `monitors`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `url` | `text` |  |
| `interval_sec` | `int4` | Nullable |
| `active` | `bool` | Nullable |
| `created_at` | `timestamptz` |  |

## Table `checks`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `monitor_id` | `uuid` | Nullable |
| `status_code` | `int4` | Nullable |
| `response_time_ms` | `int4` | Nullable |
| `error` | `text` | Nullable |
| `checked_at` | `timestamptz` |  |

## Table `incidents`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `monitor_id` | `uuid` | Nullable |
| `status` | `text` |  |
| `started_at` | `timestamptz` |  |
| `resolved_at` | `timestamptz` | Nullable |
| `webhook_sent` | `bool` | Nullable |

## Table `api_usage`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `provider` | `text` |  |
| `model` | `text` |  |
| `input_tokens` | `int4` | Nullable |
| `output_tokens` | `int4` | Nullable |
| `cost_usd` | `numeric` | Nullable |
| `created_at` | `timestamptz` |  |

## Table `shopee_queue`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `original_url` | `text` |  |
| `product_name` | `text` | Nullable |
| `status` | `text` | Nullable |
| `created_at` | `timestamptz` |  |
| `posted_at` | `timestamptz` | Nullable |

## Table `user_memories`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `summary` | `text` |  |
| `embedding` | `vector` | Nullable |
| `created_at` | `timestamptz` | Nullable |
| `last_used_at` | `timestamptz` | Nullable |
| `memory_hits` | `int4` | Nullable |
| `normalized_memory_hash` | `text` | Nullable |
| `message_hash` | `text` | Nullable |
| `memory_type` | `text` | Nullable |
| `confidence` | `float8` | Nullable |
| `source` | `text` | Nullable |
| `metadata` | `jsonb` | Nullable |
| `memory_state` | `text` | Nullable |

## Table `ai_system_logs`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `created_at` | `timestamptz` | Nullable |
| `user_id` | `uuid` | Nullable |
| `llm_call_count` | `int4` |  |
| `model_used` | `text` |  |
| `latency_ms` | `int4` |  |
| `memory_fetch_count` | `int4` |  |
| `memory_write_count` | `int4` |  |
| `error_flag` | `bool` |  |
| `cost_alert_flag` | `bool` |  |

## Table `memory_audit_logs`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `created_at` | `timestamptz` | Nullable |
| `user_id` | `uuid` | Nullable |
| `event_type` | `text` |  |
| `status` | `text` |  |
| `reason` | `text` | Nullable |
| `query` | `text` | Nullable |
| `matched_memories` | `int4` | Nullable |
| `execution_time_ms` | `int4` | Nullable |

## Table `entity_locks`
| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `entity_type` | `text` | Primary |
| `value` | `text` |  |
| `state` | `text` | Nullable |
| `updated_at` | `timestamptz` | Nullable |
| `active_memory_id` | `uuid` | Nullable |

## Table `memory_relations`
| Name | Type | Constraints |
|------|------|-------------|
| `source_memory_id` | `uuid` | Primary |
| `target_memory_id` | `uuid` | Primary |
| `relation_type` | `text` |  |
| `created_at` | `timestamptz` | Nullable |

## Table `mamet_memory`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `text` |  |
| `key` | `text` |  |
| `value` | `text` |  |
| `semantic_identity` | `text` |  |
| `confidence` | `float8` | Nullable |
| `created_at` | `timestamptz` | Nullable |
| `updated_at` | `timestamptz` | Nullable |
| `truth_score` | `float8` | Nullable |

## Table `memory_audit_log`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `text` |  |
| `input_text` | `text` |  |
| `detected_intent` | `text` |  |
| `confidence` | `float8` | Nullable |
| `action` | `text` |  |
| `reason` | `text` |  |
| `source` | `text` |  |
| `created_at` | `timestamptz` | Nullable |

## Table `knowledge_spaces`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `name` | `text` |  |
| `description` | `text` | Nullable |
| `tags` | `_text` | Nullable |
| `space_type` | `space_type_enum` | Nullable |
| `archived` | `bool` | Nullable |
| `quality_filter_enabled` | `bool` | Nullable |
| `created_at` | `timestamptz` | Nullable |
| `updated_at` | `timestamptz` | Nullable |

## Table `workspace_summaries`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `space_id` | `uuid` | Unique |
| `summary` | `text` |  |
| `updated_at` | `timestamptz` | Nullable |
