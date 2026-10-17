import { useMemo } from 'react';
import { BlendMode, Canvas, Picture, Skia, VertexMode, type SkColor, type SkPoint } from '@shopify/react-native-skia';
import type { Batch } from './three/render';

/**
 * Device backend for the 3D replay: each pre-sorted, pre-lit triangle batch
 * (three/render.ts) becomes one Skia vertices draw inside a recorded picture.
 * Skia ships in the app binary already, so this needs no new native module.
 */
export function Stage3D({ batches, width, height }: { batches: Batch[]; width: number; height: number }) {
  const picture = useMemo(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    for (const b of batches) {
      const n = b.xy.length / 2;
      if (!n || !b.idx.length) continue;
      const pts: SkPoint[] = new Array(n);
      const cols: SkColor[] = new Array(n);
      for (let i = 0; i < n; i++) {
        pts[i] = { x: b.xy[i * 2], y: b.xy[i * 2 + 1] };
        // A plain [r,g,b,a] array: the native side reads it directly (a typed-array view would be read from offset 0).
        cols[i] = [b.rgba[i * 4], b.rgba[i * 4 + 1], b.rgba[i * 4 + 2], b.rgba[i * 4 + 3]] as unknown as SkColor;
      }
      const verts = Skia.MakeVertices(VertexMode.Triangles, pts, null, cols, Array.from(b.idx));
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setBlendMode(b.blend === 'add' ? BlendMode.Plus : BlendMode.SrcOver);
      canvas.drawVertices(verts, BlendMode.Dst, paint);
    }
    return rec.finishRecordingAsPicture();
  }, [batches, width, height]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
