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

  const mainActivityPath = path.join(
    androidDir,
    'app/src/main/java/com/swavevideo/app/MainActivity.java'
  );
  if (fs.existsSync(mainActivityPath)) {
    const javaSource = `package com.swavevideo.app;

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
            webView.addJavascriptInterface(new SwaveNativeBridge(), "SwaveNative");
        }
    }

    public class SwaveNativeBridge {
        @JavascriptInterface
        public boolean saveBase64File(String base64Data, String filename, String mimeType) {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                String safeName = (filename == null || filename.isEmpty())
                    ? "swave-export.mp4"
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
                        Environment.DIRECTORY_DOWNLOADS + "/SWAVE-VIDEO"
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
                        "SWAVE-VIDEO"
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
                        "Saved to Downloads/SWAVE-VIDEO/" + safeName,
                        Toast.LENGTH_LONG
                    ).show()
                );
                return true;
            } catch (Throwable err) {
                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "Failed to save file: " + err.getMessage(),
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
    console.log('Patched MainActivity.java with SwaveNative Downloads saver.');
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
        '<string>SWAVE VIDEO needs photo library access to import videos and images into your timeline.</string>',
      ],
      [
        'NSPhotoLibraryAddUsageDescription',
        '<string>SWAVE VIDEO needs permission to save exported MP4 videos to your Photos library.</string>',
      ],
      [
        'NSMicrophoneUsageDescription',
        '<string>SWAVE VIDEO needs microphone access for Live Subtitle Dictation.</string>',
      ],
      [
        'NSCameraUsageDescription',
        '<string>SWAVE VIDEO needs camera access if you record media directly.</string>',
      ],
      ['UIFileSharingEnabled', '<true/>'],
      ['LSSupportsOpeningDocumentsInPlace', '<true/>'],
    ];

    for (const [key, valueXml] of entries) {
      if (!plist.includes(`<key>${key}</key>`)) {
        plist = plist.replace(
          /<\/dict>\s*<\/plist>/,
          `\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>`
        );
      }
    }

    if (!plist.includes('NSAppTransportSecurity')) {
      plist = plist.replace(
        /<\/dict>\s*<\/plist>/,
        `\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>\n</dict>\n</plist>`
      );
    }

    fs.writeFileSync(plistPath, plist, 'utf8');
    if (process.platform === 'darwin') {
      run(`plutil -lint "${plistPath}"`, webDir);
    }
    console.log('Patched iOS Info.plist with Photo Library, Mic, Files & LAN permissions.');
  }

  const podfilePath = path.join(iosDir, 'App/Podfile');
  if (fs.existsSync(podfilePath)) {
    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (!podfile.includes('SWAVE_UNSIGNED_PATCH')) {
      const podSettingsRuby = `  # SWAVE_UNSIGNED_PATCH
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ""
      config.build_settings['CODE_SIGNING_REQUIRED'] = "NO"
      config.build_settings['CODE_SIGNING_ALLOWED'] = "NO"
      config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = "NO"
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 13.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
      end
    end
  end`;
      if (podfile.includes('post_install do |installer|')) {
        podfile = podfile.replace(
          'post_install do |installer|',
          `post_install do |installer|\n${podSettingsRuby}`
        );
      } else {
        podfile += `\npost_install do |installer|\n${podSettingsRuby}\nend\n`;
      }
      fs.writeFileSync(podfilePath, podfile, 'utf8');
      console.log('Patched Podfile post_install for unsigned CI builds.');
      if (process.platform === 'darwin') {
        run('pod install', path.join(iosDir, 'App'));
      }
    }
  }

  const iconSetDir = path.join(
    iosDir,
    'App/App/Assets.xcassets/AppIcon.appiconset'
  );
  const icon512 = path.join(webDir, 'public/icons/icon-512.png');
  if (
    process.platform === 'darwin' &&
    fs.existsSync(iconSetDir) &&
    fs.existsSync(icon512)
  ) {
    const dest = path.join(iconSetDir, 'AppIcon-512@2x.png');
    run(`sips -s format png -z 1024 1024 "${icon512}" --out "${dest}"`, webDir);
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
    console.log('Updated 1024x1024 iOS AppIcon asset via sips.');
  }
}

ensureCapacitorPackages();
run('npm --workspace=@swave/shared run build', rootDir);
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
