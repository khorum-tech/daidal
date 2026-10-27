/** Hands [blob] to the browser as a download called [name]. */
export function download(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An SVG drawn onto a canvas at [scale] times its size, as a PNG. */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		const img = new Image();
		img.decoding = 'async';
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("Couldn't draw the diagram as an image"));
			img.src = url;
		});
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error("This browser can't make images");
		ctx.scale(scale, scale);
		ctx.drawImage(img, 0, 0, width, height);
		return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't make the PNG"))), 'image/png'));
	} finally {
		URL.revokeObjectURL(url);
	}
}
