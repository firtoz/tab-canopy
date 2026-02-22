---
"@tabcanopy/extension": minor
---

Update firtoz packages and migrate off IDB proxy

- Bump @firtoz/drizzle-indexeddb to ^1.0.0, @firtoz/drizzle-utils to ^1.0.0
- Add @firtoz/db-helpers ^1.0.0 and @standard-schema/spec ^1.1.0
- Remove IDB proxy usage: sidepanel now uses memory collections with SyncMessage[] sync over extension port
- Background emits SyncMessage[] on put/delete and on initial load; sidepanel calls collection.utils.receiveSync(messages)
- Add Vite resolve.dedupe for @tanstack/db and @tanstack/react-db to avoid duplicate instance errors
