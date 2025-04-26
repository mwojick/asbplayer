import { defineWxtModule } from 'wxt/modules';
import { InlineConfig, build, mergeConfig } from 'vite';
import { resolve } from 'node:path';
import { ContentScriptEntrypoint } from 'wxt';

export default defineWxtModule((wxt) => {
    let baseViteConfig: any;
    wxt.hooks.hook('vite:build:extendConfig', ([entrypoint], config) => {
        if (entrypoint.name === 'video-data-sync-ui') baseViteConfig = config;
    });

    const buildEsmContentScript = async () => {
        wxt.logger.info('`[esm-builder]` Building `video-data-sync-ui/esm-index`...');
        const prebuildConfig: InlineConfig = {
            build: {
                lib: {
                    entry: resolve(wxt.config.entrypointsDir, 'video-data-sync-ui/esm-index.ts'),
                    fileName: 'video-data-sync-ui',
                    formats: ['es'],
                    name: '_video-data-sync-ui',
                },
                rollupOptions: {
                    output: {
                        entryFileNames: 'video-data-sync-ui.js',
                        assetFileNames: '[name][extname]',
                    },
                },
                outDir: resolve(wxt.config.outDir, 'content-scripts/esm'),
            },
        };
        const finalConfig = mergeConfig(baseViteConfig, prebuildConfig);
        await build(finalConfig);
        wxt.logger.success('`[esm-builder]` Done!');
    };

    let contentScriptEntrypoint: ContentScriptEntrypoint;
    wxt.hooks.hook('entrypoints:resolved', (_, entrypoints) => {
        contentScriptEntrypoint = entrypoints.find((e) => e.name === 'video') as ContentScriptEntrypoint;
    });

    // Build the ESM content script
    wxt.hooks.hook('build:done', () => buildEsmContentScript());

    // Rebuilt during development
    wxt.hooks.hookOnce('build:done', () => {
        const esmBase = resolve(wxt.config.entrypointsDir, 'video-data-sync-ui');
        wxt.server?.watcher.on('all', async (_, file) => {
            if (file.startsWith(esmBase)) {
                await buildEsmContentScript();
                wxt.server?.reloadContentScript({
                    contentScript: {
                        matches: contentScriptEntrypoint.options.matches,
                        js: ['/content-scripts/video.js'],
                    },
                });
                wxt.logger.success('`[esm-builder]` Reloaded `video-data-sync-ui` after changing ESM code');
            }
        });
    });

    // Add web_accessible_resources to manifest
    wxt.hooks.hook('build:manifestGenerated', (_, manifest) => {
        manifest.web_accessible_resources ??= [];
        // @ts-expect-error: MV2 types are conflicting with MV3 declaration
        // Note, this also works when targetting MV2 - WXT automatically transforms it to the MV2 syntax
        manifest.web_accessible_resources.push({
            matches: contentScriptEntrypoint.options.matches ?? [],
            resources: ['/content-scripts/esm/*'],
        });
    });

    // Add public paths to prevent type errors
    wxt.hooks.hook('prepare:publicPaths', (_, paths) => {
        paths.push('content-scripts/esm/video-data-sync-ui.js');
    });
});
