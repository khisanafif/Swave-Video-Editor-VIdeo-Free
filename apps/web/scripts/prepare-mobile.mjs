#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(webDir, '../..');

const rawTarget = (process.argv[2] || 'android').toLowerCase();
const buildAndroid = rawTarget === 'android' || rawTarget === 'both';
const buildIos = rawTarget === 'ios' || rawTarget === 'both';

if (!buildAndroid && !buildIos) {
  console.error('Usage: node scripts/prepare-mobile.mjs [android|ios|both]');
  process.exit(1);
}

function run(cmd, cwd = webDir, extraEnv = {}) {
  console.log(`\n> ${cmd} (cwd: ${path.relative(rootDir, cwd) || '.'})`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

function ensureCapacitorPackages() {
  const pkgPaths = [
    'node_modules/@capacitor/core/package.json',
    'node_modules/@capacitor/cli/package.json',
    ...(buildAndroid ? ['node_modules/@capacitor/android/package.json'] : []),
    ...(buildIos ? ['node_modules/@capacitor/ios/package.json'] : []),
  ];

  const missing = pkgPaths.some(
    (rel) => !fs.existsSync(path.join(rootDir, rel)) && !fs.existsSync(path.join(webDir, rel))
  );

  if (missing) {
    const pkgs = ['@capacitor/core@6.2.1', '@capacitor/cli@6.2.1'];
    if (buildAndroid) pkgs.push('@capacitor/android@6.2.1');
    if (buildIos) pkgs.push('@capacitor/ios@6.2.1');
    run(`npm install --no-save ${pkgs.join(' ')}`, webDir);
  }
}

function patchAndroidProject() {
  const androidDir = path.join(webDir, 'android');
  const manifestPath = path.join(
    androidDir,
    'app/src/main/AndroidManifest.xml'
  );
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    if (!manifest.includes('android:usesCleartextTraffic')) {
      manifest = manifest.replace(
        '<application',
        '<application\n        android:usesCleartextTraffic="true"'
      );
    }

    const permissions = [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_IMAGES',
    ];
    for (const perm of permissions) {
      if (!manifest.includes(perm)) {
        manifest = manifest.replace(
          '</manifest>',
          `    <uses-permission android:name="${perm}" />\n</manifest>`
        );
      }
    }

    if (!manifest.includes('android.permission.READ_EXTERNAL_STORAGE')) {
      manifest = manifest.replace(
        '</manifest>',
        '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n</manifest>'
      );
    }
    if (!manifest.includes('android.permission.WRITE_EXTERNAL_STORAGE')) {
      manifest = manifest.replace(
        '</manifest>',
        '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n</manifest>'
      );
    }

    fs.writeFileSync(manifestPath, manifest, 'utf8');
    console.log('Patched AndroidManifest.xml with media, audio & LAN permissions.');
  }

  // Copy VeloCut PNG icons into Android mipmap launcher folders
  const resDir = path.join(androidDir, 'app/src/main/res');
  const icon192 = path.join(webDir, 'public/icons/icon-192.png');
  const icon512 = path.join(webDir, 'public/icons/icon-512.png');
  if (fs.existsSync(resDir) && fs.existsSync(icon192) && fs.existsSync(icon512)) {
    for (const entry of fs.readdirSync(resDir)) {
      if (!entry.startsWith('mipmap-')) continue;
      const folder = path.join(resDir, entry);
      const src =
        entry.includes('xxhdpi') || entry.includes('xxxhdpi') ? icon512 : icon192;
      for (const targetName of ['ic_launcher.png', 'ic_launcher_round.png']) {
        const dest = path.join(folder, targetName);
        if (fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    }
    console.log('Updated Android mipmap launcher icons.');
  }

  // Enhance MainActivity.java with native Downloads/VeloCut base64 saver
  const mainActivityPath = path.join(
    androidDir,
    'app/src/main/java/com/velocut/studio/MainActivity.java'
  );
  if (fs.existsSync(mainActivityPath)) {
    const javaSource = `package com.velocut.studio;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new VeloCutNativeBridge(), "VeloCutNative");
        }
    }

    public class VeloCutNativeBridge {
        @JavascriptInterface
        public boolean saveBase64File(String base64Data, String filename, String mimeType) {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                String safeName = (filename == null || filename.isEmpty())
                    ? "velocut-export.mp4"
                    : filename.replaceAll("[^a-zA-Z0-9._-]", "_");
                String safeMime = (mimeType == null || mimeType.isEmpty())
                    ? "video/mp4"
                    : mimeType;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                    values.put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/VeloCut"
                    );
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) return false;
                        out.write(bytes);
                    }
                } else {
                    File dir = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        "VeloCut"
                    );
                    if (!dir.exists()) dir.mkdirs();
                    File outFile = new File(dir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                    }
                }

                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "Disimpan ke Downloads/VeloCut/" + safeName,
                        Toast.LENGTH_LONG
                    ).show()
                );
                return true;
            } catch (Throwable err) {
                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "Gagal simpan native: " + err.getMessage(),
                        Toast.LENGTH_SHORT
                    ).show()
                );
                return false;
            }
        }
    }
}
`;
    fs.writeFileSync(mainActivityPath, javaSource, 'utf8');
    console.log('Patched MainActivity.java with VeloCutNative Downloads saver.');
  }
}

function patchIosProject() {
  const iosDir = path.join(webDir, 'ios');
  const plistPath = path.join(iosDir, 'App/App/Info.plist');
  if (fs.existsSync(plistPath)) {
    let plist = fs.readFileSync(plistPath, 'utf8');
    const entries = [
      [
        'NSPhotoLibraryUsageDescription',
        '<string>VeloCut membutuhkan akses galeri untuk mengimpor video dan foto ke timeline Anda.</string>',
      ],
      [
        'NSPhotoLibraryAddUsageDescription',
        '<string>VeloCut membutuhkan izin untuk menyimpan hasil ekspor video MP4 ke galeri Photos Anda.</string>',
      ],
      [
        'NSMicrophoneUsageDescription',
        '<string>VeloCut membutuhkan akses mikrofon untuk fitur Live Dikte Subtitle.</string>',
      ],
      [
        'NSCameraUsageDescription',
        '<string>VeloCut membutuhkan akses kamera bila Anda ingin merekam media.</string>',
      ],
      ['UIFileSharingEnabled', '<true/>'],
      ['LSSupportsOpeningDocumentsInPlace', '<true/>'],
    ];

    for (const [key, valueXml] of entries) {
      if (!plist.includes(`<key>${key}</key>`)) {
        plist = plist.replace(
          '</dict>\n</plist>',
          `  <key>${key}</key>\n  ${valueXml}\n</dict>\n</plist>`
        );
      }
    }

    if (!plist.includes('NSAppTransportSecurity')) {
      plist = plist.replace(
        '</dict>\n</plist>',
        `  <key>NSAppTransportSecurity</key>\n  <dict>\n    <key>NSAllowsArbitraryLoads</key>\n    <true/>\n    <key>NSAllowsLocalNetworking</key>\n    <true/>\n  </dict>\n</dict>\n</plist>`
      );
    }

    fs.writeFileSync(plistPath, plist, 'utf8');
    console.log('Patched iOS Info.plist with Photo Library, Mic, Files & LAN permissions.');
  }

  // Copy 512px PNG as iOS AppIcon (removes missing icon errors in Xcode)
  const iconSetDir = path.join(
    iosDir,
    'App/App/Assets.xcassets/AppIcon.appiconset'
  );
  const icon512 = path.join(webDir, 'public/icons/icon-512.png');
  if (fs.existsSync(iconSetDir) && fs.existsSync(icon512)) {
    const dest = path.join(iconSetDir, 'AppIcon-512@2x.png');
    fs.copyFileSync(icon512, dest);
    const contents = {
      images: [
        {
          filename: 'AppIcon-512@2x.png',
          idiom: 'universal',
          platform: 'ios',
          size: '1024x1024',
        },
      ],
      info: {
        author: 'xcode',
        version: 1,
      },
    };
    fs.writeFileSync(
      path.join(iconSetDir, 'Contents.json'),
      JSON.stringify(contents, null, 2),
      'utf8'
    );
    console.log('Updated iOS AppIcon asset.');
  }
}

ensureCapacitorPackages();
run('npm --workspace=@velocut/shared run build', rootDir);
run('npm run build', webDir, { VITE_STANDALONE_BUILD: 'true' });

if (buildAndroid) {
  const androidDir = path.join(webDir, 'android');
  if (!fs.existsSync(androidDir)) {
    run('npx cap add android', webDir);
  }
  run('npx cap sync android', webDir);
  patchAndroidProject();
  run('npx cap copy android', webDir);
}

if (buildIos) {
  const iosDir = path.join(webDir, 'ios');
  if (!fs.existsSync(iosDir)) {
    run('npx cap add ios', webDir);
  }
  run('npx cap sync ios', webDir);
  patchIosProject();
  run('npx cap copy ios', webDir);
}

console.log('\nMobile project preparation finished cleanly.');
