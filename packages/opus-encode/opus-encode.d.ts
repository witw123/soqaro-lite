export interface OpusEncodeOptions {
	sampleRate: number;
	channels?: number;
	bitrate?: number;
	application?: 'voip' | 'audio' | 'lowdelay';
}

export interface StreamEncoder {
	encode(channels: Float32Array[]): Uint8Array;
	encodeIndependent(channels: Float32Array[]): Uint8Array | Promise<Uint8Array>;
	flush(): Uint8Array;
	free(): void;
}

export const opusPreSkipSamples: 312;

export default function opus(opts: OpusEncodeOptions): Promise<StreamEncoder>;
