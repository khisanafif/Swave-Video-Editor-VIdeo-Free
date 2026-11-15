/**
 * Pure TypeScript ISO/IEC 18004 QR Code Matrix Generator (Versions 1..5, ECC Level L, Byte Mode).
 * Generates scannable QR matrices for LAN URLs (up to 106 bytes) with zero external dependencies.
 */

interface VersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  eccCodewords: number;
  alignCenters: number[];
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, alignCenters: [] },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, alignCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, eccCodewords: 26, alignCenters: [6, 30] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function computeReedSolomonEcc(data: Uint8Array, eccCount: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < eccCount; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }

  const rem = new Uint8Array(eccCount);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[eccCount - 1] = 0;
    for (let j = 0; j < eccCount; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8 = new TextEncoder().encode(text.slice(0, 106));
  const spec =
    VERSION_SPECS.find((s) => utf8.length + 2 <= s.dataCodewords) ||
    VERSION_SPECS[VERSION_SPECS.length - 1];

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Byte mode indicator (0100) + 8-bit byte count
  pushBits(0b0100, 4);
  pushBits(utf8.length, 8);
  for (const b of utf8) pushBits(b, 8);

  const maxBits = spec.dataCodewords * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataBytes[i] = b;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p++) {
    dataBytes[i] = padBytes[p % 2];
  }

  const eccBytes = computeReedSolomonEcc(dataBytes, spec.eccCodewords);
  const allCodewords = new Uint8Array(spec.dataCodewords + spec.eccCodewords);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(eccBytes, spec.dataCodewords);

  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const isBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(
          top + dr,
          left + dc,
          !isBorder && (isOuter || isInner)
        );
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.alignCenters;
  for (const r of centers) {
    for (const c of centers) {
      if (
        (r === 6 && c === 6) ||
        (r === 6 && c === size - 7) ||
        (r === size - 7 && c === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) === 2 || (dr === 0 && dc === 0);
          setFunctionModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunctionModule(8, i, false);
      setFunctionModule(i, 8, false);
    }
    if (i < 8) {
      setFunctionModule(8, size - 1 - i, false);
      setFunctionModule(size - 1 - i, 8, false);
    }
  }
  setFunctionModule(size - 8, 8, true);

  // Zigzag placement of data & ECC bits with Mask 0: (r + c) % 2 === 0
  let bitIdx = 0;
  const totalCodewordBits = allCodewords.length * 8;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunction[r][c]) continue;
        let bit = false;
        if (bitIdx < totalCodewordBits) {
          bit = ((allCodewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        const mask = (r + c) % 2 === 0;
        modules[r][c] = bit !== mask;
      }
    }
    upward = !upward;
  }

  // Write format info for ECC Level L (01) + Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  const getFmtBit = (i: number) => ((formatBits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getFmtBit(i));
  setFunctionModule(8, 7, getFmtBit(6));
  setFunctionModule(8, 8, getFmtBit(7));
  setFunctionModule(7, 8, getFmtBit(8));
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getFmtBit(i));

  for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getFmtBit(i));
  for (let i = 8; i < 15; i++)
    setFunctionModule(8, size - 15 + i, getFmtBit(i));
  setFunctionModule(size - 8, 8, true);

  return modules;
}

