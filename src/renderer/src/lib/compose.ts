import type { FrameStyle, StageBackground, StudioSettings } from '@shared/types.js';

export interface FrameGeometry {
  /** Outer size of the whole composition, including padding. */
  outerWidth: number;
  outerHeight: number;
  /** Where the mirrored pixels go. */
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  /** Bezel rectangle (equals the screen rect when the frame is `none`). */
  bezelX: number;
  bezelY: number;
  bezelWidth: number;
  bezelHeight: number;
  bezelRadius: number;
  bezelThickness: number;
}

export interface FrameSpec {
  /** Bezel thickness as a fraction of the screen's short edge. */
  thickness: number;
  /** Screen corner radius as a fraction of the short edge. */
  radius: number;
  body: string;
  rim: string;
  punchHole: 'none' | 'center' | 'left';
  sideButtons: boolean;
}

const FRAME_SPECS: Record<Exclude<FrameStyle, 'none'>, FrameSpec> = {
  flat: {
    thickness: 0.012,
    radius: 0.02,
    body: '#12161f',
    rim: '#2b3348',
    punchHole: 'none',
    sideButtons: false,
  },
  rounded: {
    thickness: 0.028,
    radius: 0.075,
    body: '#0d1017',
    rim: '#333b4d',
    punchHole: 'none',
    sideButtons: true,
  },
  pixel: {
    thickness: 0.026,
    radius: 0.09,
    body: '#101318',
    rim: '#3c4455',
    punchHole: 'center',
    sideButtons: true,
  },
  galaxy: {
    thickness: 0.018,
    radius: 0.105,
    body: '#0a0c11',
    rim: '#2a3140',
    punchHole: 'center',
    sideButtons: true,
  },
};

/** The live stage renders its bezel in CSS; it reads the same spec as the
 * canvas compositor so the preview and the exported capture cannot drift. */
export function frameSpec(style: FrameStyle): FrameSpec | null {
  return style === 'none' ? null : FRAME_SPECS[style];
}

/** Works out the layout for a given source size and Studio configuration. */
export function measure(
  sourceWidth: number,
  sourceHeight: number,
  studio: StudioSettings,
  scale: number,
): FrameGeometry {
  const screenWidth = sourceWidth * scale;
  const screenHeight = sourceHeight * scale;
  const shortEdge = Math.min(screenWidth, screenHeight);
  const padding = studio.padding * scale;

  if (studio.frame === 'none') {
    return {
      outerWidth: screenWidth + padding * 2,
      outerHeight: screenHeight + padding * 2,
      screenX: padding,
      screenY: padding,
      screenWidth,
      screenHeight,
      bezelX: padding,
      bezelY: padding,
      bezelWidth: screenWidth,
      bezelHeight: screenHeight,
      bezelRadius: 0,
      bezelThickness: 0,
    };
  }

  const spec = FRAME_SPECS[studio.frame];
  const thickness = Math.round(shortEdge * spec.thickness);
  const screenRadius = shortEdge * spec.radius;

  const bezelWidth = screenWidth + thickness * 2;
  const bezelHeight = screenHeight + thickness * 2;

  return {
    outerWidth: bezelWidth + padding * 2,
    outerHeight: bezelHeight + padding * 2,
    screenX: padding + thickness,
    screenY: padding + thickness,
    screenWidth,
    screenHeight,
    bezelX: padding,
    bezelY: padding,
    bezelWidth,
    bezelHeight,
    bezelRadius: screenRadius,
    bezelThickness: thickness,
  };
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  background: StageBackground,
  custom: string,
  width: number,
  height: number,
): void {
  if (background === 'transparent') {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  if (background === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#131c33');
    gradient.addColorStop(0.55, '#0d1424');
    gradient.addColorStop(1, '#0a0f1c');
    ctx.fillStyle = gradient;
  } else if (background === 'dark') {
    ctx.fillStyle = '#0b0f19';
  } else if (background === 'light') {
    ctx.fillStyle = '#eef2f8';
  } else {
    ctx.fillStyle = custom;
  }

  ctx.fillRect(0, 0, width, height);
}

function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Draws one composed frame: background, bezel, mirrored pixels.
 *
 * Everything is drawn with canvas primitives rather than bitmap overlays so it
 * stays sharp at any capture scale and adapts to whatever aspect ratio the
 * device reports after a rotation.
 */
export function composeFrame(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  studio: StudioSettings,
  scale: number,
): FrameGeometry {
  const geometry = measure(sourceWidth, sourceHeight, studio, scale);

  if (target.width !== Math.round(geometry.outerWidth)) {
    target.width = Math.round(geometry.outerWidth);
  }
  if (target.height !== Math.round(geometry.outerHeight)) {
    target.height = Math.round(geometry.outerHeight);
  }

  const ctx = target.getContext('2d', { alpha: true });
  if (!ctx) return geometry;

  ctx.save();
  ctx.clearRect(0, 0, target.width, target.height);
  paintBackground(ctx, studio.background, studio.customBackground, target.width, target.height);

  const spec = studio.frame === 'none' ? null : FRAME_SPECS[studio.frame];
  const bezelRadius = geometry.bezelRadius + geometry.bezelThickness;

  if (spec) {
    if (studio.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = geometry.bezelThickness * 6;
      ctx.shadowOffsetY = geometry.bezelThickness * 2;
      ctx.fillStyle = spec.body;
      roundedPath(
        ctx,
        geometry.bezelX,
        geometry.bezelY,
        geometry.bezelWidth,
        geometry.bezelHeight,
        bezelRadius,
      );
      ctx.fill();
      ctx.restore();
    }

    if (spec.sideButtons) {
      // Power and volume rockers on the right edge — a small cue that reads as
      // "phone" without pretending to be a specific model.
      const buttonWidth = Math.max(2, geometry.bezelThickness * 0.45);
      const x = geometry.bezelX + geometry.bezelWidth - buttonWidth * 0.35;
      ctx.fillStyle = spec.rim;
      ctx.fillRect(
        x,
        geometry.bezelY + geometry.bezelHeight * 0.17,
        buttonWidth,
        geometry.bezelHeight * 0.07,
      );
      ctx.fillRect(
        x,
        geometry.bezelY + geometry.bezelHeight * 0.28,
        buttonWidth,
        geometry.bezelHeight * 0.11,
      );
    }

    ctx.fillStyle = spec.body;
    roundedPath(
      ctx,
      geometry.bezelX,
      geometry.bezelY,
      geometry.bezelWidth,
      geometry.bezelHeight,
      bezelRadius,
    );
    ctx.fill();

    ctx.strokeStyle = spec.rim;
    ctx.lineWidth = Math.max(1, geometry.bezelThickness * 0.16);
    ctx.stroke();
  }

  // Mirrored pixels, clipped to the screen's rounded corners.
  ctx.save();
  roundedPath(
    ctx,
    geometry.screenX,
    geometry.screenY,
    geometry.screenWidth,
    geometry.screenHeight,
    geometry.bezelRadius,
  );
  ctx.clip();
  ctx.drawImage(
    source,
    geometry.screenX,
    geometry.screenY,
    geometry.screenWidth,
    geometry.screenHeight,
  );
  ctx.restore();

  if (spec?.punchHole !== 'none' && spec) {
    const radius = Math.max(3, Math.min(geometry.screenWidth, geometry.screenHeight) * 0.014);
    const cx =
      spec.punchHole === 'center'
        ? geometry.screenX + geometry.screenWidth / 2
        : geometry.screenX + radius * 3.2;
    const cy = geometry.screenY + radius * 3.2;

    ctx.fillStyle = '#05070c';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return geometry;
}

/** Renders one composition and hands back a PNG. */
export async function composeToBlob(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  studio: StudioSettings,
  scale: number,
): Promise<Blob | null> {
  const target = document.createElement('canvas');
  composeFrame(target, source, sourceWidth, sourceHeight, studio, scale);

  return new Promise((resolve) => {
    target.toBlob((blob) => resolve(blob), 'image/png');
  });
}
