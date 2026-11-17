import { env } from '@huggingface/transformers';

export interface OrtWasmRuntimeOptions {
  ortBaseUrl?: string;
  preferCdnWasm?: boolean;
}

/**
 * Configures ONNX Runtime Web WASM paths safely for same-origin static hosting
 * (GitHub Pages subpath, localhost, Capacitor Android APK, and iOS/Safari WebView)
 * with single-threaded execution to prevent SharedArrayBuffer/COOP pthread failures.
 */
export function configureOnnxWasmRuntime(options: OrtWasmRuntimeOptions): void {
  const onnxEnv = env.backends?.onnx as
    | {
        wasm?: {
          numThreads?: number;
          proxy?: boolean;
          wasmPaths?: string | { mjs?: string; wasm?: string };
        };
      }
    | undefined;
  if (!onnxEnv?.wasm) return;

  onnxEnv.wasm.numThreads = 1;
  onnxEnv.wasm.proxy = false;

  if (!options.preferCdnWasm && options.ortBaseUrl) {
    const base = options.ortBaseUrl.endsWith('/')
      ? options.ortBaseUrl
      : `${options.ortBaseUrl}/`;
    onnxEnv.wasm.wasmPaths = {
      mjs: `${base}ort-wasm-simd-threaded.mjs`,
      wasm: `${base}ort-wasm-simd-threaded.wasm`,
    };
  }
}
