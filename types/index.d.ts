export * from './paint.js';
import type { WireComment, ParsedComment, TextMetricsBox, MaterialOptions } from './paint.js';
export type Payload = WireComment[] | { comments: WireComment[]; [key: string]: unknown };
export interface LayoutOptions { scrollLifetime?: number; staticLifetime?: number; scrollLanes?: number; staticLanes?: number; maxVisible?: number; laneGap?: number }
export interface RendererOptions {
 container: HTMLElement; video?: HTMLVideoElement | null; getTime?: (() => number) | null;
 canvas?: HTMLCanvasElement | null; layout?: LayoutOptions; material?: MaterialOptions;
 useEffects?: boolean; gradientOnly?: boolean; zIndex?: number;
 onFrame?: ((stats: { effects: number; fallback: number }) => void) | null;
}
export class DanmuxCanvasRenderer {
 constructor(options: RendererOptions);
 load(payload: Payload): { total: number; withGradient: number };
 setOptions(options?: Pick<RendererOptions, 'useEffects' | 'gradientOnly' | 'layout' | 'material'>): void;
 tick(nowSeconds: number): void; clear(): void; stop(): void; destroy(): void;
 latestFrameStats: { effects: number; fallback: number };
}
export const GRADIENT_LINEAR_V1: string;
export function clamp01(value: unknown): number;
export function cssColor(value: unknown): string;
export function normalizeAngle(value: unknown): number;
export function rgbaColor(value: string, alpha?: number, whiteMix?: number): string;
export function findLinearGradientEffect(effects: unknown[], target?: 'fill' | 'stroke'): import('./paint.js').LinearEffect | null;
export function parseWireComments(payload: Payload): ParsedComment[];
export const DEFAULT_LAYOUT: Required<LayoutOptions>;
export function lowerBound(items: ParsedComment[], target: number): number;
export function commentLifetime(item: ParsedComment, layout: Required<LayoutOptions>): number;
export function planFrame(items: ParsedComment[], now: number, viewport: { width: number; height: number; fontSize: number }, layout: Required<LayoutOptions>, metricsFor: (item: ParsedComment, fontSize: number) => TextMetricsBox): Array<{ item: ParsedComment; elapsed: number; lifetime: number; lane: number; x: number; y: number; metrics: TextMetricsBox; isStatic: boolean }>;
