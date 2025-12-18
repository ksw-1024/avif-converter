type AvifEncodeRequest = {
	type: 'encode-avif';
	id: number;
	width: number;
	height: number;
	rgba: ArrayBuffer;
	quality: number; // 0.0 - 1.0
};

type AvifEncodeResponse =
	| { type: 'encode-avif-result'; id: number; ok: true; mime: 'image/avif'; bytes: ArrayBuffer }
	| { type: 'encode-avif-result'; id: number; ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

let avifModPromise: Promise<typeof import('@jsquash/avif')> | null = null;

async function getAvifMod() {
	if (!avifModPromise) avifModPromise = import('@jsquash/avif');
	return avifModPromise;
}

function toTransferable(bytes: Uint8Array): ArrayBuffer {
	const start = bytes.byteOffset;
	const end = start + bytes.byteLength;
	return bytes.buffer.slice(start, end);
}

self.addEventListener('message', async (ev: MessageEvent<AvifEncodeRequest>) => {
	const msg = ev.data;
	if (!msg || msg.type !== 'encode-avif') return;

	try {
		const { encode } = await getAvifMod();
		const rgba = new Uint8ClampedArray(msg.rgba);
		const imageData = new ImageData(rgba, msg.width, msg.height);
		const quality = Math.round(msg.quality * 100);

		// @jsquash/avif encodes ImageData-like RGBA into AVIF bytes.
		const encoded = await encode(imageData, { quality });
		const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded as ArrayBuffer);

		const payload: AvifEncodeResponse = {
			type: 'encode-avif-result',
			id: msg.id,
			ok: true,
			mime: 'image/avif',
			bytes: toTransferable(bytes),
		};
		self.postMessage(payload, { transfer: [payload.bytes] });
	} catch (err) {
		const payload: AvifEncodeResponse = {
			type: 'encode-avif-result',
			id: msg.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
		self.postMessage(payload);
	}
});
