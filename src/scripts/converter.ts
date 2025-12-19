type OutputFormat = 'webp' | 'avif';

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

type ItemStatus = 'ready' | 'converting' | 'done' | 'error';
type Item = {
	id: number;
	file: File;
	inputUrl: string;
	status: ItemStatus;
	outputBlob: Blob | null;
	outputMime: string | null;
	outputSize: number | null;
	error: string | null;
};

function assertEl<T extends Element>(el: T | null, name: string): T {
	if (!el) throw new Error(`Missing element: ${name}`);
	return el;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '-';
	const units = ['B', 'KB', 'MB', 'GB'] as const;
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function stripExt(filename: string): string {
	const lastDot = filename.lastIndexOf('.');
	return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

function withExt(filename: string, ext: string): string {
	return `${stripExt(filename)}.${ext}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) reject(new Error(`このブラウザは ${type} への変換に対応していません。`));
				else resolve(blob);
			},
			type,
			quality
		);
	});
}

let avifWorker: Worker | null = null;
let avifReqId = 0;
const avifPending = new Map<number, { resolve: (v: ArrayBuffer) => void; reject: (e: Error) => void }>();

function getAvifWorker(): Worker {
	if (avifWorker) return avifWorker;
	avifWorker = new Worker(new URL('../workers/avif-encoder.worker.ts', import.meta.url), { type: 'module' });
	avifWorker.addEventListener('message', (ev: MessageEvent<AvifEncodeResponse>) => {
		const msg = ev.data;
		if (!msg || msg.type !== 'encode-avif-result') return;
		const pending = avifPending.get(msg.id);
		if (!pending) return;
		avifPending.delete(msg.id);
		if (msg.ok) pending.resolve(msg.bytes);
		else pending.reject(new Error(msg.error));
	});
	avifWorker.addEventListener('error', (ev) => {
		console.error(ev);
	});
	return avifWorker;
}

async function encodeAvifInWorker(imageData: ImageData, quality01: number): Promise<Blob> {
	const worker = getAvifWorker();
	const id = ++avifReqId;
	const rgbaCopy = imageData.data.slice().buffer;

	const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
		avifPending.set(id, { resolve, reject });
		const msg: AvifEncodeRequest = {
			type: 'encode-avif',
			id,
			width: imageData.width,
			height: imageData.height,
			rgba: rgbaCopy,
			quality: quality01,
		};
		worker.postMessage(msg, { transfer: [rgbaCopy] });
	});

	return new Blob([bytes], { type: 'image/avif' });
}

function setText(el: Element, text: string) {
	el.textContent = text;
}

async function saveBlob(blob: Blob, filename: string) {
	const w = window as unknown as {
		showSaveFilePicker?: (opts: {
			suggestedName?: string;
			types?: Array<{ description?: string; accept: Record<string, string[]> }>;
		}) => Promise<FileSystemFileHandle>;
	};

	// Prefer the File System Access API when available: avoids "new tab" behavior on some browsers.
	if (typeof w.showSaveFilePicker === 'function') {
		const handle = await w.showSaveFilePicker({
			suggestedName: filename,
			types: [
				{
					description: 'Image',
					accept: { [blob.type || 'application/octet-stream']: [`.${filename.split('.').pop() ?? ''}`] },
				},
			],
		});
		const writable = await handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return;
	}

	// Fallback: anchor download. Use an octet-stream URL to reduce cases where the browser tries to "open" the image.
	const forceDownloadBlob =
		blob.type.startsWith('image/') || blob.type === 'application/zip'
			? new Blob([blob], { type: 'application/octet-stream' })
			: blob;
	const url = URL.createObjectURL(forceDownloadBlob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	a.target = '_self';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc ^= bytes[i];
		for (let j = 0; j < 8; j++) {
			const mask = -(crc & 1);
			crc = (crc >>> 1) ^ (0xedb88320 & mask);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
	const b = new Uint8Array(2);
	b[0] = n & 0xff;
	b[1] = (n >>> 8) & 0xff;
	return b;
}

function u32(n: number): Uint8Array {
	const b = new Uint8Array(4);
	b[0] = n & 0xff;
	b[1] = (n >>> 8) & 0xff;
	b[2] = (n >>> 16) & 0xff;
	b[3] = (n >>> 24) & 0xff;
	return b;
}

function concat(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const c of chunks) total += c.length;
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

async function buildZip(entries: Array<{ name: string; blob: Blob }>): Promise<Blob> {
	const encoder = new TextEncoder();
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = encoder.encode(entry.name);
		const dataBytes = new Uint8Array(await entry.blob.arrayBuffer());
		const crc = crc32(dataBytes);
		const size = dataBytes.byteLength;
		const flags = 1 << 11; // UTF-8

		// Local file header
		const localHeader = concat([
			u32(0x04034b50),
			u16(20),
			u16(flags),
			u16(0), // store
			u16(0),
			u16(0),
			u32(crc),
			u32(size),
			u32(size),
			u16(nameBytes.length),
			u16(0),
			nameBytes,
		]);
		localParts.push(localHeader, dataBytes);

		// Central directory header
		const centralHeader = concat([
			u32(0x02014b50),
			u16(20),
			u16(20),
			u16(flags),
			u16(0),
			u16(0),
			u16(0),
			u32(crc),
			u32(size),
			u32(size),
			u16(nameBytes.length),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			u32(0),
			u32(offset),
			nameBytes,
		]);
		centralParts.push(centralHeader);

		offset += localHeader.length + dataBytes.length;
	}

	const centralDir = concat(centralParts);
	const centralOffset = offset;
	const centralSize = centralDir.length;
	const count = entries.length;

	const end = concat([
		u32(0x06054b50),
		u16(0),
		u16(0),
		u16(count),
		u16(count),
		u32(centralSize),
		u32(centralOffset),
		u16(0),
	]);

	const zipBytes = concat([...localParts, centralDir, end]);
	return new Blob([zipBytes], { type: 'application/zip' });
}

function main() {
	const dropzone = assertEl(document.querySelector<HTMLDivElement>('#dropzone'), '#dropzone');
	const pickBtn = assertEl(document.querySelector<HTMLButtonElement>('#pickBtn'), '#pickBtn');
	const fileInput = assertEl(document.querySelector<HTMLInputElement>('#fileInput'), '#fileInput');
	const fileMeta = assertEl(document.querySelector<HTMLDivElement>('#fileMeta'), '#fileMeta');
	const formatSelect = assertEl(document.querySelector<HTMLSelectElement>('#formatSelect'), '#formatSelect');
	const qualitySlider = assertEl(document.querySelector<HTMLInputElement>('#qualitySlider'), '#qualitySlider');
	const qualityValue = assertEl(document.querySelector<HTMLSpanElement>('#qualityValue'), '#qualityValue');
	const convertBtn = assertEl(document.querySelector<HTMLButtonElement>('#convertBtn'), '#convertBtn');
	const downloadAllBtn = assertEl(document.querySelector<HTMLButtonElement>('#downloadAllBtn'), '#downloadAllBtn');
	const clearBtn = assertEl(document.querySelector<HTMLButtonElement>('#clearBtn'), '#clearBtn');
	const fileList = assertEl(document.querySelector<HTMLDivElement>('#fileList'), '#fileList');
	const statusEl = assertEl(document.querySelector<HTMLDivElement>('#status'), '#status');
	const errorEl = assertEl(document.querySelector<HTMLDivElement>('#error'), '#error');

	let items: Item[] = [];
	let nextItemId = 0;
	let isBusy = false;

	function setBusy(next: boolean) {
		isBusy = next;
		convertBtn.disabled = next || items.length === 0;
		clearBtn.disabled = next || items.length === 0;
		downloadAllBtn.disabled = next || items.every((it) => !it.outputBlob);
		pickBtn.disabled = next;
		fileInput.disabled = next;
		formatSelect.disabled = next;
		qualitySlider.disabled = next;
		if (next) setText(statusEl, '変換中…');
		// The per-item buttons are rendered dynamically; re-render when busy state changes
		// so "ダウンロード" becomes clickable after conversion completes.
		render();
	}

	function clearError() {
		setText(errorEl, '');
	}

	function setError(message: string) {
		setText(errorEl, message);
	}

	function clearOutputs() {
		for (const item of items) {
			item.outputBlob = null;
			item.outputMime = null;
			item.outputSize = null;
			item.error = null;
			item.status = 'ready';
		}
		render();
	}

	function clearAll() {
		for (const item of items) {
			URL.revokeObjectURL(item.inputUrl);
		}
		items = [];
		render();
	}

	function totalBytes(): number {
		return items.reduce((sum, it) => sum + (it.file.size || 0), 0);
	}

	function updateMeta() {
		if (isBusy) return;
		if (items.length === 0) {
			setText(fileMeta, '');
			setText(statusEl, '画像を選択してください');
			return;
		}
		setText(fileMeta, `${items.length} 枚 / 合計 ${formatBytes(totalBytes())}`);
		setText(statusEl, '準備OK');
	}

	function render() {
		updateMeta();
		convertBtn.disabled = isBusy || items.length === 0;
		clearBtn.disabled = isBusy || items.length === 0;
		downloadAllBtn.disabled = isBusy || items.every((it) => !it.outputBlob);

		fileList.replaceChildren();
		for (const item of items) {
			const row = document.createElement('div');
			row.className = 'grid grid-cols-[90px_1fr] gap-3 p-3 border-2 border-[var(--border)] rounded-md bg-[var(--card)]';

			const thumb = document.createElement('div');
			thumb.className = 'w-[90px] h-16 rounded border-2 border-[var(--border)] bg-[var(--bg)] grid place-items-center overflow-hidden';
			const img = document.createElement('img');
			img.alt = item.file.name;
			img.src = item.inputUrl;
			img.className = 'w-full h-full object-cover block';
			thumb.appendChild(img);

			const meta = document.createElement('div');
			meta.className = 'grid gap-2';

			const name = document.createElement('div');
			name.className = 'font-extrabold text-[13px] leading-tight break-words text-[var(--text)]';
			name.textContent = item.file.name;

			const sub = document.createElement('div');
			sub.className = 'text-[var(--text-soft)] text-xs font-medium whitespace-pre-wrap break-words';
			const lines: string[] = [];
			lines.push(`入力: ${formatBytes(item.file.size)} (${item.file.type || 'unknown'})`);
			if (item.status === 'converting') lines.push('状態: 変換中…');
			if (item.status === 'ready') lines.push('状態: 未変換');
			if (item.status === 'done') lines.push(`出力: ${formatBytes(item.outputSize ?? 0)} (${item.outputMime ?? 'unknown'})`);
			if (item.status === 'error') lines.push(`エラー: ${item.error ?? '変換に失敗しました。'}`);
			sub.textContent = lines.join('\n');

			const actions = document.createElement('div');
			actions.className = 'flex flex-wrap gap-2';

			const convertOneBtn = document.createElement('button');
			convertOneBtn.type = 'button';
			convertOneBtn.className = 'appearance-none border-2 px-3 py-2 rounded-md cursor-pointer font-bold text-xs transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--accent)] text-[var(--card)] border-[var(--accent)] hover:enabled:bg-[var(--accent-soft)] hover:enabled:border-[var(--accent-soft)]';
			convertOneBtn.textContent = '変換';
			convertOneBtn.disabled = isBusy;
			convertOneBtn.addEventListener('click', () => void convertOne(item.id));

			const dlBtn = document.createElement('button');
			dlBtn.type = 'button';
			dlBtn.className = 'appearance-none border-2 border-[var(--border)] bg-[var(--card)] text-[var(--text)] px-3 py-2 rounded-md cursor-pointer font-bold text-xs transition-all duration-200 hover:enabled:bg-[var(--bg)] hover:enabled:border-[var(--border-strong)] disabled:opacity-40 disabled:cursor-not-allowed';
			dlBtn.textContent = 'ダウンロード';
			dlBtn.disabled = isBusy || !item.outputBlob;
			dlBtn.addEventListener('click', () => void download(item.id));

			actions.appendChild(convertOneBtn);
			actions.appendChild(dlBtn);

			meta.appendChild(name);
			meta.appendChild(sub);
			meta.appendChild(actions);

			row.appendChild(thumb);
			row.appendChild(meta);
			fileList.appendChild(row);
		}
	}

	function addFiles(files: File[]) {
		clearError();
		const accepted: File[] = [];
		const rejected: File[] = [];

		for (const f of files) {
			if (['image/jpeg', 'image/png'].includes(f.type)) accepted.push(f);
			else rejected.push(f);
		}

		if (rejected.length > 0) {
			setError('JPG または PNG のみ対応しています。');
		}

		for (const file of accepted) {
			const inputUrl = URL.createObjectURL(file);
			items.push({
				id: ++nextItemId,
				file,
				inputUrl,
				status: 'ready',
				outputBlob: null,
				outputMime: null,
				outputSize: null,
				error: null,
			});
		}

		render();
	}

	async function decodeToImageData(file: File): Promise<ImageData> {
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error('Canvas 2D コンテキストを作成できませんでした。');
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		return ctx.getImageData(0, 0, canvas.width, canvas.height);
	}

	async function convertOne(itemId: number) {
		if (isBusy) return;
		const item = items.find((x) => x.id === itemId);
		if (!item) return;
		clearError();
		setBusy(true);

		try {
			const format = formatSelect.value as OutputFormat;
			const quality01 = Number(qualitySlider.value) / 100;
			item.status = 'converting';
			item.error = null;
			render();

			const imageData = await decodeToImageData(item.file);

			let blob: Blob;

			if (format === 'webp') {
				const canvas = document.createElement('canvas');
				canvas.width = imageData.width;
				canvas.height = imageData.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('Canvas 2D コンテキストを作成できませんでした。');
				ctx.putImageData(imageData, 0, 0);
				blob = await canvasToBlob(canvas, 'image/webp', quality01);
			} else {
				blob = await encodeAvifInWorker(imageData, quality01);
			}

			item.outputBlob = blob;
			item.outputMime = blob.type || (format === 'webp' ? 'image/webp' : 'image/avif');
			item.outputSize = blob.size;
			item.status = 'done';
			render();
		} catch (err) {
			console.error(err);
			item.status = 'error';
			item.error = err instanceof Error ? err.message : String(err);
			render();
		} finally {
			setBusy(false);
		}
	}

	async function convertAll() {
		if (isBusy || items.length === 0) return;
		clearError();
		setBusy(true);

		try {
			for (const item of items) {
				// Skip already done items if settings haven't changed (we clear outputs on settings change)
				if (item.status === 'done' && item.outputBlob) continue;
				await convertOneInternal(item);
			}
		} finally {
			setBusy(false);
			render();
		}
	}

	async function convertOneInternal(item: Item) {
		const format = formatSelect.value as OutputFormat;
		const quality01 = Number(qualitySlider.value) / 100;
		item.status = 'converting';
		item.error = null;
		render();

		try {
			const imageData = await decodeToImageData(item.file);
			let blob: Blob;
			if (format === 'webp') {
				const canvas = document.createElement('canvas');
				canvas.width = imageData.width;
				canvas.height = imageData.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('Canvas 2D コンテキストを作成できませんでした。');
				ctx.putImageData(imageData, 0, 0);
				blob = await canvasToBlob(canvas, 'image/webp', quality01);
			} else {
				blob = await encodeAvifInWorker(imageData, quality01);
			}

			item.outputBlob = blob;
			item.outputMime = blob.type || (format === 'webp' ? 'image/webp' : 'image/avif');
			item.outputSize = blob.size;
			item.status = 'done';
			item.error = null;
			render();
		} catch (err) {
			console.error(err);
			item.status = 'error';
			item.error = err instanceof Error ? err.message : String(err);
			render();
		}
	}

	async function download(itemId: number) {
		const item = items.find((x) => x.id === itemId);
		if (!item?.outputBlob) return;
		const format = formatSelect.value as OutputFormat;
		const outputFilename = withExt(item.file.name, format === 'webp' ? 'webp' : 'avif');
		await saveBlob(item.outputBlob, outputFilename);
	}

	async function downloadAllAsZip() {
		if (isBusy) return;
		const done = items.filter((it) => it.outputBlob);
		if (done.length === 0) return;

		clearError();
		setBusy(true);
		try {
			const format = formatSelect.value as OutputFormat;
			const zipEntries = done.map((it) => ({
				name: withExt(it.file.name, format === 'webp' ? 'webp' : 'avif'),
				blob: it.outputBlob!,
			}));
			const zipBlob = await buildZip(zipEntries);
			const ts = new Date();
			const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(
				ts.getHours()
			).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
			await saveBlob(zipBlob, `converted-${stamp}.zip`);
		} catch (err) {
			console.error(err);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	function openPicker() {
		if (isBusy) return;
		fileInput.click();
	}

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		addFiles(Array.from(files));
		fileInput.value = '';
	}

	qualitySlider.addEventListener('input', () => {
		setText(qualityValue, String(qualitySlider.value));
		clearOutputs();
	});

	formatSelect.addEventListener('change', () => {
		clearOutputs();
	});

	convertBtn.addEventListener('click', () => {
		void convertAll();
	});
	downloadAllBtn.addEventListener('click', () => {
		void downloadAllAsZip();
	});

	pickBtn.addEventListener('click', openPicker);
	dropzone.addEventListener('click', openPicker);
	clearBtn.addEventListener('click', () => {
		if (isBusy) return;
		clearError();
		clearAll();
	});

	dropzone.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			openPicker();
		}
	});

	fileInput.addEventListener('change', () => handleFiles(fileInput.files));

	dropzone.addEventListener('dragover', (ev) => {
		ev.preventDefault();
		dropzone.classList.add('is-dragover');
	});
	dropzone.addEventListener('dragleave', () => {
		dropzone.classList.remove('is-dragover');
	});
	dropzone.addEventListener('drop', (ev) => {
		ev.preventDefault();
		dropzone.classList.remove('is-dragover');
		handleFiles(ev.dataTransfer?.files ?? null);
	});

	window.addEventListener('beforeunload', () => {
		for (const item of items) {
			URL.revokeObjectURL(item.inputUrl);
		}
	});

	render();
}

main();
