# IDB Transport Adapter

React context provider for managing the IDB transport adapter connection to the background service worker.

## Usage

```tsx
import { IdbTransportAdapterProvider, useIdbAdapter } from "./lib/db";

function App() {
  return (
    <IdbTransportAdapterProvider
      options={{
        enabled: true,
        maxRetries: -1, // Infinite retries
        retryDelay: 100,
        maxRetryDelay: 5000,
      }}
    >
      <AppContent />
    </IdbTransportAdapterProvider>
  );
}

function AppContent() {
  const adapter = useIdbAdapter();
  
  // All adapter methods are available
  await adapter.resetDatabase();
  await adapter.sendMoveIntent([...]);
  await adapter.startManagedWindowMove([...]);
  adapter.endManagedWindowMove();
  adapter.enableTestMode();
  adapter.injectBrowserEvent({ ... });
  
  return <div>...</div>;
}
```

## Features

- **Real connection state** - Based on actual pong events from background
- **Automatic retry** - Exponential backoff with configurable max retries
- **Proper lifecycle** - Handles initialization, cleanup, and reconnection automatically
- **Enable/disable support** - Can be toggled dynamically
- **Type-safe** - Full TypeScript support

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the adapter |
| `maxRetries` | `number` | `-1` | Maximum retry attempts (-1 for infinite) |
| `retryDelay` | `number` | `100` | Initial retry delay in ms |
| `maxRetryDelay` | `number` | `5000` | Maximum retry delay in ms |

## Adapter Methods

### Database
- `resetDatabase(): Promise<void>`

### Tab Management
- `sendMoveIntent(moves: UiMoveIntentData[]): Promise<void>`
- `sendPendingChildIntent(data: PendingChildTabData): void`
- `startManagedWindowMove(tabIds: number[]): Promise<void>`
- `endManagedWindowMove(): void`

### Testing
- `enableTestMode(): void`
- `injectBrowserEvent(event: InjectBrowserEvent): void`
- `getTabCreatedEvents(): Promise<TabCreatedEvent[]>`
- `clearTabCreatedEvents(): void`

### Connection
- `getConnectionState(): "connecting" | "connected" | "disconnected"`
- `isReady(): boolean`
- `reconnect(): void`
- `dispose(): void`
