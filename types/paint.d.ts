export interface LinearEffect {
 type: 'gradient'; target: 'fill' | 'stroke'; origin?: 'native' | 'generated';
 source: { type: 'linear'; angle: number; stops: Array<{ position: number; color: string; alpha?: number }> };
}
export interface WireComment { p: string; m: string; danmux?: { extensionVersion: number; effects?: unknown[] }; [key: string]: unknown }
export interface Diagnostic { code: string; message?: string; path?: string }
export interface CommentStyle { fill: LinearEffect | null; stroke: LinearEffect | null; diagnostics: Diagnostic[] }
export interface ParsedComment { index: number; time: number; mode: number; color: string; text: string; effects: LinearEffect[]; raw: WireComment; hasGradient: boolean; diagnostics: Diagnostic[]; metrics?: TextMetricsBox | null }
export interface TextMetricsBox { width: number; height: number; font?: string }
export interface MaterialOptions {
 profile?: 'wire' | 'bilibili'; opacity?: number; fontWeight?: number; fontFamily?: string;
 fontSizeRatio?: number; minFontSize?: number; maxFontSize?: number; whiteMix?: number;
 halo?: { strokeAlpha?: number; strokeColor?: string; extraWidthRatio?: number; minExtra?: number; shadow?: { alpha?: number; blurRatio?: number; offsetYRatio?: number } };
 gradientStroke?: { widthRatio?: number; minWidth?: number };
 gloss?: { enabled?: boolean; alphaScale?: number; stops?: Array<[number, string]> };
 fallback?: { strokeColor?: string; widthRatio?: number; minWidth?: number; shadow?: { alpha?: number; blurRatio?: number; offsetYRatio?: number } };
}
export interface PaintOptions {
 x?: number; y?: number; fontSize?: number; font?: string; opacity?: number;
 width?: number; height?: number; strokeWidth?: number; useEffects?: boolean;
 fallback?: 'host' | 'draw'; material?: MaterialOptions;
}
export interface PaintResult { handled: boolean; enhanced: boolean; diagnostics: Diagnostic[] }
export function readCommentStyle(comment: WireComment): CommentStyle;
export function parseWireComment(comment: WireComment, index: number): ParsedComment;
export function drawDanmuxComment(context: CanvasRenderingContext2D, comment: WireComment, options?: PaintOptions): PaintResult;
export const DEFAULT_MATERIAL: Readonly<MaterialOptions>;
