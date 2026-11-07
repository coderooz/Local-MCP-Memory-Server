# Data Flow Map — local-mcp-memory v2.6.0

## Data Ingestion & Retrieval Flow
```
[Agent Memory Request] 
      │
      ▼
[Memory Tool Handler: store_memory]
      │
      ▼
[Data Sanitizer & Validator]
      │
      ▼
[SQLite Adapter: Prepared Insert]
      │
      ├──> [contexts table (Primary Record)]
      └──> [activities table (Audit Stream Event)]
```
