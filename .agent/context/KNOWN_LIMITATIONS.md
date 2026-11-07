# Known Limitations & Constraints

1. **Windows Subprocess Child Pathing:**
   - When executing commands via child process wrappers on Windows, always ensure paths with spaces or special characters are quoted properly.
2. **SQLite Concurrent Writers:**
   - SQLite WAL mode supports unlimited concurrent readers, but only one active writer at a time. The database adapter implements exponential backoff retry for busy states.
3. **Legacy Migration Fixtures:**
   - One test record in MongoDB contains a NoSQL injection payload (`{ $gt: '' }`) created during April 2026 security testing. It is preserved safely via JSON string serialization.
