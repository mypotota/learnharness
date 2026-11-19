/**
 * Layered handling for the Android back gesture / back button.
 *
 * Transient layers (bottom sheets) register themselves while open; the most
 * recently opened layer is consulted first and may consume the gesture by
 * returning true. When nobody consumes it, the app shell falls back to
 * router history and finally to minimizing the app.
 */

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function pushBackHandler(handler: BackHandler): () => void {
	handlers.push(handler);
	return () => {
		const index = handlers.lastIndexOf(handler);
		if (index >= 0) handlers.splice(index, 1);
	};
}

export function runBackHandlers(): boolean {
	for (let index = handlers.length - 1; index >= 0; index -= 1) {
		if (handlers[index]?.()) return true;
	}
	return false;
}
