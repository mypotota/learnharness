import { registerPlugin } from "@capacitor/core";

/** Native loopback server that streams upstream HTTPS responses to the
 *  WebView (see LocalProxyPlugin.java). One instance per app launch. */
export interface LocalProxyPlugin {
	start(): Promise<{ port: number; token: string }>;
	stop(): Promise<void>;
}

export const LocalProxy = registerPlugin<LocalProxyPlugin>("LocalProxy");
