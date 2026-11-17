import type { BlendMode, Clip, ClipAnimationType, TextStyle } from '@swave/shared';

export interface CompositeLayer {
  clip: Clip;
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  sourceWidth: number;
  sourceHeight: number;
  localTime?: number;
}

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_uv;

uniform vec2 u_canvasSize;
uniform vec2 u_quadSize;
uniform vec2 u_offset;
uniform float u_scale;
uniform float u_rotation;
uniform vec2 u_flip;

out vec2 v_uv;

void main() {
  vec2 scaled = a_pos * u_quadSize * u_scale * u_flip;
  float c = cos(u_rotation);
  float s = sin(u_rotation);
  vec2 rotated = vec2(
    scaled.x * c - scaled.y * s,
    scaled.x * s + scaled.y * c
  );
  vec2 screenPos = rotated + (u_canvasSize * 0.5) + u_offset;
  vec2 ndc = vec2(
    (screenPos.x / u_canvasSize.x) * 2.0 - 1.0,
    1.0 - (screenPos.y / u_canvasSize.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_texture;
uniform vec2 u_quadSize;
uniform vec4 u_crop;
uniform float u_cornerRadius;
uniform float u_opacity;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_grayscale;
uniform float u_sepia;
uniform float u_vignette;
uniform float u_chromab;
uniform float u_blur;
uniform float u_pixelate;
uniform float u_chromaEnabled;
uniform vec3 u_chromaColor;
uniform float u_chromaTolerance;
uniform float u_chromaSmooth;

out vec4 outColor;

vec4 sampleTex(vec2 uv) {
  vec2 clampedUv = clamp(uv, 0.0, 1.0);
  return texture(u_texture, clampedUv);
}

void main() {
  float cTop = u_crop.x;
  float cRight = u_crop.y;
  float cBottom = u_crop.z;
  float cLeft = u_crop.w;

  if (
    v_uv.x < cLeft ||
    v_uv.x > (1.0 - cRight) ||
    v_uv.y < cTop ||
    v_uv.y > (1.0 - cBottom)
  ) {
    discard;
  }

  float edgeAlpha = 1.0;
  if (u_cornerRadius > 0.002) {
    vec2 boxMin = vec2(cLeft, cTop) * u_quadSize;
    vec2 boxMax = vec2(1.0 - cRight, 1.0 - cBottom) * u_quadSize;
    vec2 boxCenter = (boxMin + boxMax) * 0.5;
    vec2 halfSize = max(vec2(1.0), (boxMax - boxMin) * 0.5);
    float radius = clamp(u_cornerRadius, 0.0, 0.5) * min(halfSize.x, halfSize.y) * 2.0;
    vec2 p = abs((v_uv * u_quadSize) - boxCenter) - (halfSize - vec2(radius));
    float dist = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - radius;
    edgeAlpha = 1.0 - smoothstep(-1.2, 1.2, dist);
    if (edgeAlpha <= 0.001) discard;
  }

  vec2 uv = v_uv;

  // Pixelate (Mosaic)
  if (u_pixelate > 0.001) {
    float blocks = mix(240.0, 18.0, clamp(u_pixelate, 0.0, 1.0));
    uv = floor(uv * blocks) / blocks + (0.5 / blocks);
  }

  vec4 tex;
  if (u_blur > 0.001) {
    float r = u_blur * 0.012;
    vec4 sum = sampleTex(uv) * 0.28;
    sum += sampleTex(uv + vec2(r, 0.0)) * 0.12;
    sum += sampleTex(uv - vec2(r, 0.0)) * 0.12;
    sum += sampleTex(uv + vec2(0.0, r)) * 0.12;
    sum += sampleTex(uv - vec2(0.0, r)) * 0.12;
    sum += sampleTex(uv + vec2(r, r)) * 0.06;
    sum += sampleTex(uv + vec2(-r, r)) * 0.06;
    sum += sampleTex(uv + vec2(r, -r)) * 0.06;
    sum += sampleTex(uv + vec2(-r, -r)) * 0.06;
    tex = sum;
  } else {
    tex = sampleTex(uv);
  }

  // Chromatic Aberration (RGB Split Glitch)
  if (u_chromab > 0.001) {
    float shift = u_chromab * 0.018;
    float rChan = sampleTex(uv + vec2(shift, 0.0)).r;
    float bChan = sampleTex(uv - vec2(shift, 0.0)).b;
    tex.r = rChan;
    tex.b = bChan;
  }

  // Chroma Key (Green/Blue Screen) in YCbCr chroma space
  float chromaAlpha = 1.0;
  if (u_chromaEnabled > 0.5) {
    float kCb = -0.168736 * u_chromaColor.r - 0.331264 * u_chromaColor.g + 0.5 * u_chromaColor.b;
    float kCr = 0.5 * u_chromaColor.r - 0.418688 * u_chromaColor.g - 0.081312 * u_chromaColor.b;
    float pCb = -0.168736 * tex.r - 0.331264 * tex.g + 0.5 * tex.b;
    float pCr = 0.5 * tex.r - 0.418688 * tex.g - 0.081312 * tex.b;
    float dist = distance(vec2(pCb, pCr), vec2(kCb, kCr));
    float smoothW = max(0.02, u_chromaSmooth);
    chromaAlpha = smoothstep(u_chromaTolerance - smoothW, u_chromaTolerance + smoothW, dist);
    if (chromaAlpha < 0.98 && u_chromaColor.g >= u_chromaColor.r && u_chromaColor.g >= u_chromaColor.b) {
      float maxRB = max(tex.r, tex.b);
      if (tex.g > maxRB) {
        tex.g = mix(tex.g, maxRB, 0.55 * (1.0 - chromaAlpha));
      }
    }
  }

  vec3 color = tex.rgb;

  // Brightness, Contrast & Color Temperature (Warm / Cool)
  color += vec3(u_brightness);
  color = (color - 0.5) * u_contrast + 0.5;
  color.r += u_temperature * 0.14;
  color.g += u_temperature * 0.025;
  color.b -= u_temperature * 0.14;

  // Saturation & Grayscale
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_saturation);
  color = mix(color, vec3(luma), u_grayscale);

  // Sepia
  if (u_sepia > 0.001) {
    vec3 sepiaColor = vec3(
      dot(color, vec3(0.393, 0.769, 0.189)),
      dot(color, vec3(0.349, 0.686, 0.168)),
      dot(color, vec3(0.272, 0.534, 0.131))
    );
    color = mix(color, sepiaColor, clamp(u_sepia, 0.0, 1.0));
  }

  // Vignette
  if (u_vignette > 0.001) {
    float dist = distance(v_uv, vec2(0.5, 0.5));
    float vig = smoothstep(0.32, 0.85, dist);
    color *= (1.0 - vig * u_vignette * 0.85);
  }

  color = clamp(color, 0.0, 1.0);
  outColor = vec4(color, tex.a * u_opacity * edgeAlpha * chromaAlpha);
}
`;

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = (hex || '#09090b').replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return [0.035, 0.035, 0.043];
}

function applyAnimDelta(
  animType: ClipAnimationType | undefined,
  progress: number, // 0 at edge, 1 when fully settled
  isOut: boolean
): { dx: number; dy: number; scaleMul: number; rotDeg: number; alphaMul: number } {
  if (!animType || animType === 'none' || progress >= 0.999) {
    return { dx: 0, dy: 0, scaleMul: 1, rotDeg: 0, alphaMul: 1 };
  }
  const t = Math.max(0, Math.min(1, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  const inv = 1 - eased;

  switch (animType) {
    case 'fade':
      return { dx: 0, dy: 0, scaleMul: 1, rotDeg: 0, alphaMul: eased };
    case 'zoom-in':
      return {
        dx: 0,
        dy: 0,
        scaleMul: 0.35 + 0.65 * eased,
        rotDeg: 0,
        alphaMul: eased,
      };
    case 'slide-up':
      return {
        dx: 0,
        dy: (isOut ? -160 : 160) * inv,
        scaleMul: 1,
        rotDeg: 0,
        alphaMul: eased,
      };
    case 'slide-left':
      return {
        dx: (isOut ? -220 : 220) * inv,
        dy: 0,
        scaleMul: 1,
        rotDeg: 0,
        alphaMul: eased,
      };
    case 'spin':
      return {
        dx: 0,
        dy: 0,
        scaleMul: 0.4 + 0.6 * eased,
        rotDeg: (isOut ? 180 : -180) * inv,
        alphaMul: eased,
      };
    default:
      return { dx: 0, dy: 0, scaleMul: 1, rotDeg: 0, alphaMul: 1 };
  }
}

function computeAnimatedTransform(clip: Clip, localTime?: number) {
  let x = clip.transforms.x;
  let y = clip.transforms.y;
  let scale = clip.transforms.scale;
  let rotationDeg = clip.transforms.rotation;
  let opacity = clip.transforms.opacity;

  const anim = clip.animation;
  if (anim && localTime !== undefined && clip.duration > 0) {
    if (anim.in && anim.in !== 'none' && anim.inDuration > 0 && localTime < anim.inDuration) {
      const d = applyAnimDelta(anim.in, localTime / anim.inDuration, false);
      x += d.dx;
      y += d.dy;
      scale *= d.scaleMul;
      rotationDeg += d.rotDeg;
      opacity *= d.alphaMul;
    }
    const remaining = clip.duration - localTime;
    if (
      anim.out &&
      anim.out !== 'none' &&
      anim.outDuration > 0 &&
      remaining < anim.outDuration
    ) {
      const d = applyAnimDelta(anim.out, remaining / anim.outDuration, true);
      x += d.dx;
      y += d.dy;
      scale *= d.scaleMul;
      rotationDeg += d.rotDeg;
      opacity *= d.alphaMul;
    }
  }

  return {
    x,
    y,
    scale,
    rotationDeg,
    opacity: Math.max(0, Math.min(1, opacity)),
    flipX: clip.transforms.flipH ? -1 : 1,
    flipY: clip.transforms.flipV ? -1 : 1,
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function getEffect(clip: Clip, type: string, fallback: number): number {
  const found = clip.effects.find((e) => e.type === type);
  return found ? found.value : fallback;
}

function applyWebGLBlendMode(
  gl: WebGL2RenderingContext,
  blendMode?: BlendMode
): void {
  switch (blendMode) {
    case 'screen':
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_COLOR,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
    case 'multiply':
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(
        gl.DST_COLOR,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
    case 'overlay':
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
    case 'lighten':
      gl.blendEquation(gl.MAX);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
    case 'darken':
      gl.blendEquation(gl.MIN);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
    case 'normal':
    default:
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      break;
  }
}

export class WebGLCompositor {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private readonly textureCache = new Map<string, WebGLTexture>();
  private readonly textCanvasCache = new Map<
    string,
    { key: string; canvas: HTMLCanvasElement }
  >();

  public readonly backend: 'webgl2' | 'canvas2d';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      if (gl) {
        this.gl = gl;
        this.initWebGL(gl);
        this.backend = 'webgl2';
        return;
      }
    } catch {
      // Fallback to Canvas 2D
    }
    this.ctx2d = canvas.getContext('2d');
    this.backend = 'canvas2d';
  }

  private initWebGL(gl: WebGL2RenderingContext): void {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;

    // Unit quad centered at (0,0): pos (-0.5..+0.5), uv (0..1)
    const vertices = new Float32Array([
      -0.5, -0.5, 0, 0,
       0.5, -0.5, 1, 0,
      -0.5,  0.5, 0, 1,
      -0.5,  0.5, 0, 1,
       0.5, -0.5, 1, 0,
       0.5,  0.5, 1, 1,
    ]);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uvLoc = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    this.vao = vao;
    this.vbo = vbo;

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
  }

  getTextLayerCanvas(
    clipId: string,
    style: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
    subtitleWords?: Array<{ word: string; start: number; end: number }>,
    localTime?: number
  ): HTMLCanvasElement {
    let activeWordIdx = -1;
    if (subtitleWords && subtitleWords.length > 0 && localTime !== undefined) {
      activeWordIdx = subtitleWords.findIndex(
        (w) => localTime >= w.start && localTime < w.end
      );
      if (activeWordIdx < 0 && localTime >= subtitleWords[subtitleWords.length - 1].start) {
        activeWordIdx = subtitleWords.length - 1;
      }
    }

    const cacheKey = JSON.stringify({
      style,
      canvasWidth,
      canvasHeight,
      activeWordIdx: style.highlightColor ? activeWordIdx : -1,
    });
    const cached = this.textCanvasCache.get(clipId);
    if (cached && cached.key === cacheKey) {
      return cached.canvas;
    }

    const offscreen = cached?.canvas || document.createElement('canvas');
    offscreen.width = canvasWidth;
    offscreen.height = canvasHeight;
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const weight = style.bold ? '700' : '400';
      const size = Math.max(14, style.fontSize);
      ctx.font = `${weight} ${size}px ${style.fontFamily}`;
      ctx.textBaseline = 'middle';

      const maxLineWidth = Math.max(220, canvasWidth * 0.86);

      // Tokenize paragraphs into wrapped lines while keeping word indices for karaoke highlight
      type WordToken = { text: string; wordIdx: number };
      const wrappedLines: WordToken[][] = [];
      let globalWordCounter = 0;

      const paragraphs = (style.content || '').split('\n');
      for (const para of paragraphs) {
        const rawWords = para.trim().split(/\s+/).filter(Boolean);
        if (rawWords.length === 0) {
          wrappedLines.push([]);
          continue;
        }
        let currentLine: WordToken[] = [];
        for (const w of rawWords) {
          const token: WordToken = { text: w, wordIdx: globalWordCounter++ };
          const candidateStr = [...currentLine, token]
            .map((t) => t.text)
            .join(' ');
          if (
            currentLine.length > 0 &&
            ctx.measureText(candidateStr).width > maxLineWidth
          ) {
            wrappedLines.push(currentLine);
            currentLine = [token];
          } else {
            currentLine.push(token);
          }
        }
        if (currentLine.length > 0) {
          wrappedLines.push(currentLine);
        }
      }

      if (wrappedLines.length === 0) {
        wrappedLines.push([]);
      }

      const lineStrings = wrappedLines.map((tokens) =>
        tokens.map((t) => t.text).join(' ')
      );
      const lineHeight = size * 1.28;
      const totalH = lineStrings.length * lineHeight;
      const maxW = Math.max(
        100,
        ...lineStrings.map((line) => ctx.measureText(line).width)
      );

      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;

      if (style.backgroundColor && style.backgroundColor !== 'transparent') {
        const padX = 28;
        const padY = 16;
        ctx.fillStyle = style.backgroundColor;
        const boxW = maxW + padX * 2;
        const boxH = totalH + padY * 2;
        const radius = 14;
        const bx = centerX - boxW / 2;
        const by = centerY - boxH / 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, radius);
        ctx.fill();
      }

      if (style.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      const strokeW = style.strokeWidth || 0;
      const useWordHighlight =
        Boolean(style.highlightColor) &&
        subtitleWords &&
        subtitleWords.length > 0 &&
        activeWordIdx >= 0;

      if (!useWordHighlight) {
        ctx.textAlign = style.align || 'center';
        ctx.fillStyle = style.color || '#ffffff';
        const anchorX =
          style.align === 'left'
            ? centerX - maxW / 2
            : style.align === 'right'
            ? centerX + maxW / 2
            : centerX;

        lineStrings.forEach((line, idx) => {
          const y = centerY - totalH / 2 + lineHeight * (idx + 0.5);
          if (strokeW > 0 && typeof ctx.strokeText === 'function') {
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.lineWidth = strokeW;
            ctx.strokeStyle = style.strokeColor || '#000000';
            ctx.strokeText(line, anchorX, y);
          }
          ctx.fillText(line, anchorX, y);
        });
      } else {
        ctx.textAlign = 'left';
        const spaceW = ctx.measureText(' ').width;
        wrappedLines.forEach((tokens, lineIdx) => {
          const lineStr = lineStrings[lineIdx];
          const lineW = ctx.measureText(lineStr).width;
          const y = centerY - totalH / 2 + lineHeight * (lineIdx + 0.5);
          let cursorX =
            style.align === 'left'
              ? centerX - maxW / 2
              : style.align === 'right'
              ? centerX + maxW / 2 - lineW
              : centerX - lineW / 2;

          for (const tok of tokens) {
            const wordW = ctx.measureText(tok.text).width;
            const isActive = tok.wordIdx === activeWordIdx;

            if (isActive && style.highlightColor) {
              ctx.save();
              ctx.shadowBlur = 0;
              ctx.fillStyle = style.highlightColor;
              ctx.beginPath();
              ctx.roundRect(
                cursorX - 6,
                y - size * 0.56,
                wordW + 12,
                size * 1.12,
                10
              );
              ctx.fill();
              ctx.restore();
            }

            if (strokeW > 0 && typeof ctx.strokeText === 'function' && !isActive) {
              ctx.lineJoin = 'round';
              ctx.miterLimit = 2;
              ctx.lineWidth = strokeW;
              ctx.strokeStyle = style.strokeColor || '#000000';
              ctx.strokeText(tok.text, cursorX, y);
            }

            ctx.fillStyle = isActive
              ? '#09090b'
              : style.color || '#ffffff';
            ctx.fillText(tok.text, cursorX, y);
            cursorX += wordW + spaceW;
          }
        });
      }
    }

    this.textCanvasCache.set(clipId, { key: cacheKey, canvas: offscreen });
    return offscreen;
  }

  render(layers: CompositeLayer[], canvasBackground = '#09090b'): void {
    if (this.gl && this.program && this.vao) {
      this.renderWebGL(this.gl, layers, canvasBackground);
    } else if (this.ctx2d) {
      this.renderCanvas2D(this.ctx2d, layers, canvasBackground);
    }
  }

  private getOrCreateTexture(
    gl: WebGL2RenderingContext,
    key: string
  ): WebGLTexture {
    let tex = this.textureCache.get(key);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textureCache.set(key, tex);
    }
    return tex;
  }

  private renderWebGL(
    gl: WebGL2RenderingContext,
    layers: CompositeLayer[],
    canvasBackground: string
  ): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    gl.viewport(0, 0, cw, ch);
    const [bgR, bgG, bgB] = hexToRgbNormalized(canvasBackground);
    gl.clearColor(bgR, bgG, bgB, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const loc = (name: string) => gl.getUniformLocation(this.program!, name);
    gl.uniform2f(loc('u_canvasSize'), cw, ch);

    for (const layer of layers) {
      const { clip, source, sourceWidth, sourceHeight, localTime } = layer;
      if (sourceWidth <= 0 || sourceHeight <= 0) continue;

      if (
        source instanceof HTMLVideoElement &&
        source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        continue;
      }

      const anim = computeAnimatedTransform(clip, localTime);
      if (anim.opacity <= 0.001) continue;

      const tex = this.getOrCreateTexture(gl, clip.id);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(loc('u_texture'), 0);

      const fitScale = Math.min(cw / sourceWidth, ch / sourceHeight);
      const quadW = sourceWidth * fitScale;
      const quadH = sourceHeight * fitScale;

      const crop = clip.transforms.crop;
      const cTop = Math.max(0, Math.min(45, crop?.top ?? 0)) / 100;
      const cRight = Math.max(0, Math.min(45, crop?.right ?? 0)) / 100;
      const cBottom = Math.max(0, Math.min(45, crop?.bottom ?? 0)) / 100;
      const cLeft = Math.max(0, Math.min(45, crop?.left ?? 0)) / 100;
      const cornerRadius =
        Math.max(0, Math.min(50, clip.transforms.cornerRadius ?? 0)) / 100;

      const chroma = clip.chromaKey;
      const [ckR, ckG, ckB] = chroma?.enabled
        ? hexToRgbNormalized(chroma.color || '#00b140')
        : [0, 0.7, 0.25];

      gl.uniform2f(loc('u_quadSize'), quadW, quadH);
      gl.uniform4f(loc('u_crop'), cTop, cRight, cBottom, cLeft);
      gl.uniform1f(loc('u_cornerRadius'), cornerRadius);
      gl.uniform2f(loc('u_offset'), anim.x, anim.y);
      gl.uniform1f(loc('u_scale'), anim.scale);
      gl.uniform1f(
        loc('u_rotation'),
        (anim.rotationDeg * Math.PI) / 180
      );
      gl.uniform2f(loc('u_flip'), anim.flipX, anim.flipY);
      gl.uniform1f(loc('u_opacity'), anim.opacity);
      gl.uniform1f(loc('u_brightness'), getEffect(clip, 'brightness', 0));
      gl.uniform1f(loc('u_contrast'), getEffect(clip, 'contrast', 1));
      gl.uniform1f(loc('u_saturation'), getEffect(clip, 'saturation', 1));
      gl.uniform1f(loc('u_temperature'), getEffect(clip, 'temperature', 0));
      gl.uniform1f(loc('u_grayscale'), getEffect(clip, 'grayscale', 0));
      gl.uniform1f(loc('u_sepia'), getEffect(clip, 'sepia', 0));
      gl.uniform1f(loc('u_vignette'), getEffect(clip, 'vignette', 0));
      gl.uniform1f(loc('u_chromab'), getEffect(clip, 'chromab', 0));
      gl.uniform1f(loc('u_blur'), getEffect(clip, 'blur', 0));
      gl.uniform1f(loc('u_pixelate'), getEffect(clip, 'pixelate', 0));
      gl.uniform1f(loc('u_chromaEnabled'), chroma?.enabled ? 1 : 0);
      gl.uniform3f(loc('u_chromaColor'), ckR, ckG, ckB);
      gl.uniform1f(loc('u_chromaTolerance'), chroma?.tolerance ?? 0.32);
      gl.uniform1f(loc('u_chromaSmooth'), chroma?.smoothness ?? 0.08);

      applyWebGLBlendMode(gl, clip.blendMode);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    applyWebGLBlendMode(gl, 'normal');
    gl.bindVertexArray(null);
  }

  private renderCanvas2D(
    ctx: CanvasRenderingContext2D,
    layers: CompositeLayer[],
    canvasBackground: string
  ): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.fillStyle = canvasBackground || '#09090b';
    ctx.fillRect(0, 0, cw, ch);

    for (const layer of layers) {
      const { clip, source, sourceWidth, sourceHeight, localTime } = layer;
      if (sourceWidth <= 0 || sourceHeight <= 0) continue;

      const anim = computeAnimatedTransform(clip, localTime);
      if (anim.opacity <= 0.001) continue;

      const fitScale = Math.min(cw / sourceWidth, ch / sourceHeight);
      const drawW = sourceWidth * fitScale * anim.scale;
      const drawH = sourceHeight * fitScale * anim.scale;
      const crop = clip.transforms.crop;
      const cTop = (Math.max(0, Math.min(45, crop?.top ?? 0)) / 100) * drawH;
      const cRight = (Math.max(0, Math.min(45, crop?.right ?? 0)) / 100) * drawW;
      const cBottom = (Math.max(0, Math.min(45, crop?.bottom ?? 0)) / 100) * drawH;
      const cLeft = (Math.max(0, Math.min(45, crop?.left ?? 0)) / 100) * drawW;
      const cornerNorm = Math.max(0, Math.min(50, clip.transforms.cornerRadius ?? 0)) / 100;

      ctx.save();
      ctx.globalAlpha = anim.opacity;
      if (clip.blendMode && clip.blendMode !== 'normal') {
        ctx.globalCompositeOperation = clip.blendMode;
      }

      const b = getEffect(clip, 'brightness', 0);
      const c = getEffect(clip, 'contrast', 1);
      const s = getEffect(clip, 'saturation', 1);
      const gs = getEffect(clip, 'grayscale', 0);
      const sp = getEffect(clip, 'sepia', 0);
      const bl = getEffect(clip, 'blur', 0);
      if (b !== 0 || c !== 1 || s !== 1 || gs > 0 || sp > 0 || bl > 0) {
        ctx.filter = `brightness(${1 + b}) contrast(${c}) saturate(${s}) grayscale(${gs}) sepia(${sp}) blur(${bl * 8}px)`;
      }

      ctx.translate(cw / 2 + anim.x, ch / 2 + anim.y);
      ctx.rotate((anim.rotationDeg * Math.PI) / 180);
      ctx.scale(anim.flipX, anim.flipY);

      if (cTop > 0 || cRight > 0 || cBottom > 0 || cLeft > 0 || cornerNorm > 0.002) {
        const bx = -drawW / 2 + cLeft;
        const by = -drawH / 2 + cTop;
        const bw = Math.max(2, drawW - cLeft - cRight);
        const bh = Math.max(2, drawH - cTop - cBottom);
        const rPx = cornerNorm * Math.min(bw, bh);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(bx, by, bw, bh, rPx);
        } else {
          ctx.rect(bx, by, bw, bh);
        }
        ctx.clip();
      }

      ctx.drawImage(
        source as CanvasImageSource,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH
      );
      ctx.restore();
    }
  }

  dispose(): void {
    if (this.gl) {
      for (const tex of this.textureCache.values()) {
        this.gl.deleteTexture(tex);
      }
      this.textureCache.clear();
      if (this.vbo) this.gl.deleteBuffer(this.vbo);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.textCanvasCache.clear();
  }
}

