import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { Batch } from './three/render';

/**
 * Web backend for the 3D replay: draws the same pre-sorted, pre-lit triangle
 * batches as the device's Skia backend, with a tiny WebGL program (Skia on web
 * would mean a multi-MB CanvasKit download and a slow per-vertex conversion).
 */
const VS = `
attribute vec2 a_pos;
attribute vec4 a_col;
uniform vec2 u_size;
varying vec4 v_col;
void main() {
  vec2 c = a_pos / u_size * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_col = a_col;
}`;
const FS = `
precision mediump float;
varying vec4 v_col;
void main() { gl_FragColor = vec4(v_col.rgb * v_col.a, v_col.a); }`;

interface GLState {
  gl: WebGLRenderingContext;
  pos: WebGLBuffer;
  col: WebGLBuffer;
  idx: WebGLBuffer;
  aPos: number;
  aCol: number;
  uSize: WebGLUniformLocation | null;
}

function setup(canvas: HTMLCanvasElement): GLState | null {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  return {
    gl,
    pos: gl.createBuffer()!,
    col: gl.createBuffer()!,
    idx: gl.createBuffer()!,
    aPos: gl.getAttribLocation(prog, 'a_pos'),
    aCol: gl.getAttribLocation(prog, 'a_col'),
    uSize: gl.getUniformLocation(prog, 'u_size'),
  };
}

export function Stage3D({ batches, width, height }: { batches: Batch[]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GLState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!glRef.current) glRef.current = setup(canvas);
    const st = glRef.current;
    if (!st) return;
    const { gl } = st;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.uniform2f(st.uSize, width, height);
    for (const b of batches) {
      if (!b.idx.length) continue;
      gl.blendFunc(gl.ONE, b.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, st.pos);
      gl.bufferData(gl.ARRAY_BUFFER, b.xy, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(st.aPos);
      gl.vertexAttribPointer(st.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, st.col);
      gl.bufferData(gl.ARRAY_BUFFER, b.rgba, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(st.aCol);
      gl.vertexAttribPointer(st.aCol, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, st.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.idx, gl.STREAM_DRAW);
      gl.drawElements(gl.TRIANGLES, b.idx.length, gl.UNSIGNED_SHORT, 0);
    }
  }, [batches, width, height]);

  return (
    <View style={{ width, height }}>
      {createElement('canvas', { ref: canvasRef, style: { width, height, display: 'block' }, 'data-testid': 'replay3d' })}
    </View>
  );
}
