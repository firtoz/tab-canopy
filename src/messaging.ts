// ./messaging.ts
import type {
	IDBProxyRequest,
	IDBProxyResponse,
} from "@firtoz/drizzle-indexeddb";
import { defineExtensionMessaging } from "@webext-core/messaging";

interface ProtocolMap {
	idbProxyRequest(request: IDBProxyRequest): IDBProxyResponse;
	testMessage(message: string): string;
}

export const { sendMessage, onMessage } =
	defineExtensionMessaging<ProtocolMap>();
