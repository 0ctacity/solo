/**
 * Compile the ChatGPT-style example into a standalone Bun binary.
 * On macOS also wraps it in a .app so Finder and Dock can show a custom icon.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const SVG = path.join(ROOT, 'assets', 'icons', 'openai-mark.svg')
const PNG = path.join(DIST, 'app-icon.png')
const ICO = path.join(DIST, 'app-icon.ico')
const ICNS = path.join(DIST, 'app-icon.icns')
const BINARY = path.join(DIST, process.platform === 'win32' ? 'chat.exe' : 'chat')
const APP_NAME = 'GPUIX Chat'
const APP_BUNDLE = path.join(DIST, `${APP_NAME}.app`)

function log(message: string): void {
  console.log(`[compile-chat] ${message}`)
}

function run(command: string, args: string[], opts: { cwd?: string } = {}): void {
  log(`run: ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = result.stdout.trim()
  const stderr = result.stderr.trim()
  if (stdout && command !== 'sips') console.log(stdout)
  if (stderr && command !== 'sips') console.error(stderr)
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit ${result.status}`)
  }
}

async function buildIcons(): Promise<void> {
  log(`building icons from ${path.relative(ROOT, SVG)}`)
  const svg = (await Bun.file(SVG).text()).replace(
    'fill="currentColor"',
    'fill="#ffffff"',
  )
  const whiteSvg = path.join(DIST, 'app-icon.svg')
  await Bun.write(whiteSvg, svg)

  run('rsvg-convert', [
    '-w',
    '1024',
    '-h',
    '1024',
    '--background-color',
    '#10a37f',
    whiteSvg,
    '-o',
    PNG,
  ])
  log(`wrote ${path.relative(ROOT, PNG)}`)

  run('magick', [PNG, '-define', 'icon:auto-resize=256,128,64,48,32,16', ICO])
  log(`wrote ${path.relative(ROOT, ICO)}`)

  if (process.platform !== 'darwin') return

  const iconset = path.join(DIST, 'app-icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })
  const sizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ] as const
  for (const [px, name] of sizes) {
    run('sips', ['-z', String(px), String(px), PNG, '--out', path.join(iconset, name)])
  }
  run('iconutil', ['-c', 'icns', iconset, '-o', ICNS])
  log(`wrote ${path.relative(ROOT, ICNS)}`)
}

async function compileBinary(): Promise<void> {
  log('bundling chat.tsx into a standalone binary')
  const compile: {
    outfile: string
    windows?: {
      icon: string
      hideConsole: boolean
      title: string
      publisher: string
      version: string
      description: string
    }
  } = {
    outfile: BINARY,
  }
  if (process.platform === 'win32') {
    compile.windows = {
      icon: ICO,
      hideConsole: true,
      title: APP_NAME,
      publisher: 'GPUIX',
      version: '0.1.0',
      description: 'ChatGPT-style desktop app built with GPUIX',
    }
  }

  const result = await Bun.build({
    entrypoints: [path.join(ROOT, 'chat.tsx')],
    compile,
    minify: true,
  })
  if (!result.success) {
    for (const message of result.logs) console.error(message)
    throw new Error('bun build --compile failed')
  }
  const output = result.outputs[0]?.path ?? BINARY
  log(`wrote ${path.relative(ROOT, output)}`)
}

function wrapMacApp(): void {
  if (process.platform !== 'darwin') return
  log(`wrapping ${path.relative(ROOT, BINARY)} in ${path.basename(APP_BUNDLE)}`)
  rmSync(APP_BUNDLE, { recursive: true, force: true })
  const macos = path.join(APP_BUNDLE, 'Contents', 'MacOS')
  const resources = path.join(APP_BUNDLE, 'Contents', 'Resources')
  mkdirSync(macos, { recursive: true })
  mkdirSync(resources, { recursive: true })

  const executable = path.join(macos, 'chat')
  run('cp', [BINARY, executable])
  run('chmod', ['+x', executable])
  run('cp', [ICNS, path.join(resources, 'AppIcon.icns')])

  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>CFBundleDevelopmentRegion</key>',
    '  <string>en</string>',
    '  <key>CFBundleDisplayName</key>',
    `  <string>${APP_NAME}</string>`,
    '  <key>CFBundleExecutable</key>',
    '  <string>chat</string>',
    '  <key>CFBundleIconFile</key>',
    '  <string>AppIcon</string>',
    '  <key>CFBundleIdentifier</key>',
    '  <string>dev.gpuix.chat</string>',
    '  <key>CFBundleInfoDictionaryVersion</key>',
    '  <string>6.0</string>',
    '  <key>CFBundleName</key>',
    `  <string>${APP_NAME}</string>`,
    '  <key>CFBundlePackageType</key>',
    '  <string>APPL</string>',
    '  <key>CFBundleShortVersionString</key>',
    '  <string>0.1.0</string>',
    '  <key>CFBundleVersion</key>',
    '  <string>1</string>',
    '  <key>LSMinimumSystemVersion</key>',
    '  <string>13.0</string>',
    '  <key>NSHighResolutionCapable</key>',
    '  <true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
  writeFileSync(path.join(APP_BUNDLE, 'Contents', 'Info.plist'), plist)
  run('touch', [APP_BUNDLE])
  log(`wrote ${path.relative(ROOT, APP_BUNDLE)}`)
}

async function main(): Promise<void> {
  log(`output dir ${path.relative(ROOT, DIST) || '.'}`)
  rmSync(DIST, { recursive: true, force: true })
  mkdirSync(DIST, { recursive: true })
  await buildIcons()
  await compileBinary()
  wrapMacApp()
  log('done')
  if (process.platform === 'darwin') {
    log(`run: open "${APP_BUNDLE}"`)
  } else {
    log(`run: ${BINARY}`)
  }
}

await main()
