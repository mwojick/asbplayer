import {
    AnkiUiInitialState,
    OpenAsbplayerSettingsMessage,
    CopyToClipboardMessage,
    TabToExtensionCommand,
    CardModel,
    EncodeMp3Message,
    AnkiDialogSettingsMessage,
    ActiveProfileMessage,
    SettingsUpdatedMessage,
    AnkiUiBridgeExportedMessage,
} from '@project/common';
import { AnkiSettings, SettingsProvider, ankiSettingsKeys } from '@project/common/settings';
import { sourceString } from '@project/common/util';
import UiFrame from '../services/ui-frame';
import { Mp3Encoder } from '@project/common/audio-clip';
import { base64ToBlob, blobToBase64 } from '@project/common/base64';
import { mp3WorkerFactory } from '../services/mp3-worker-factory';
import { ExtensionGlobalStateProvider } from '../services/extension-global-state-provider';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

const globalStateProvider = new ExtensionGlobalStateProvider();

export class TabAnkiUiController {
    private readonly _frame: UiFrame;
    private readonly _settings: SettingsProvider;

    constructor(ctx: ContentScriptContext, settings: SettingsProvider) {
        this._frame = new UiFrame(ctx, '/anki-ui.html');
        this._settings = settings;
    }

    async show(card: CardModel) {
        const { language, ...ankiDialogSettings } = await this._settings.get([
            'language',
            'themeType',
            'lastSelectedAnkiExportMode',
            ...ankiSettingsKeys,
        ]);
        const profilesPromise = this._settings.profiles();
        const activeProfilePromise = this._settings.activeProfile();
        const globalStatePromise = globalStateProvider.getAll();
        const client = await this._client(language, ankiDialogSettings);
        const state: AnkiUiInitialState = {
            type: 'initial',
            open: true,
            canRerecord: false,
            settings: ankiDialogSettings,
            source: sourceString(card.subtitleFileName, card.mediaTimestamp ?? 0),
            dialogRequestedTimestamp: 0,
            ...card,
            profiles: await profilesPromise,
            activeProfile: (await activeProfilePromise)?.name,
            ftueHasSeenAnkiDialogQuickSelect: (await globalStatePromise).ftueHasSeenAnkiDialogQuickSelectV2,
        };
        client.updateState(state);
    }

    async updateSettings() {
        const ankiDialogSettings = await this._settings.get([
            'themeType',
            'lastSelectedAnkiExportMode',
            ...ankiSettingsKeys,
        ]);

        if (this._frame.bound) {
            this._frame.client().then(async (client) => {
                const profilesPromise = this._settings.profiles();
                const activeProfilePromise = this._settings.activeProfile();
                const message: AnkiDialogSettingsMessage = {
                    command: 'settings',
                    settings: ankiDialogSettings,
                    profiles: await profilesPromise,
                    activeProfile: (await activeProfilePromise)?.name,
                };
                client.sendMessage(message);
            });
        }
    }

    private async _client(language: string, ankiSettings: AnkiSettings) {
        this._frame.fetchOptions = {
            allowedFetchUrl: ankiSettings.ankiConnectUrl,
        };
        this._frame.language = language;
        const isNewClient = await this._frame.bind();
        const client = await this._frame.client();

        if (isNewClient) {
            client.onMessage(async (message) => {
                switch (message.command) {
                    case 'openSettings':
                        const openSettingsCommand: TabToExtensionCommand<OpenAsbplayerSettingsMessage> = {
                            sender: 'asbplayer-video-tab',
                            message: {
                                command: 'open-asbplayer-settings',
                            },
                        };
                        browser.runtime.sendMessage(openSettingsCommand);
                        return;
                    case 'copy-to-clipboard':
                        const copyToClipboardMessage = message as CopyToClipboardMessage;
                        const copyToClipboardCommand: TabToExtensionCommand<CopyToClipboardMessage> = {
                            sender: 'asbplayer-video-tab',
                            message: {
                                command: 'copy-to-clipboard',
                                dataUrl: copyToClipboardMessage.dataUrl,
                            },
                        };
                        browser.runtime.sendMessage(copyToClipboardCommand);
                        return;
                    case 'encode-mp3':
                        const { base64, messageId, extension } = message as EncodeMp3Message;
                        const encodedBlob = await Mp3Encoder.encode(
                            await base64ToBlob(base64, `audio/${extension}`),
                            mp3WorkerFactory
                        );
                        client.sendMessage({
                            messageId,
                            base64: await blobToBase64(encodedBlob),
                        });
                        return;
                    case 'resume':
                        this._frame.hide();
                        return;
                    case 'activeProfile':
                        const activeProfileMessage = message as ActiveProfileMessage;
                        this._settings.setActiveProfile(activeProfileMessage.profile).then(() => {
                            const settingsUpdatedCommand: TabToExtensionCommand<SettingsUpdatedMessage> = {
                                sender: 'asbplayer-video-tab',
                                message: {
                                    command: 'settings-updated',
                                },
                            };
                            browser.runtime.sendMessage(settingsUpdatedCommand);
                        });
                        return;
                    case 'dismissedQuickSelectFtue':
                        globalStateProvider.set({ ftueHasSeenAnkiDialogQuickSelectV2: true }).catch(console.error);
                        return;
                    case 'exported':
                        const exportedMessage = message as AnkiUiBridgeExportedMessage;
                        this._settings.set({ lastSelectedAnkiExportMode: exportedMessage.mode }).then(() => {
                            const settingsUpdatedCommand: TabToExtensionCommand<SettingsUpdatedMessage> = {
                                sender: 'asbplayer-video-tab',
                                message: {
                                    command: 'settings-updated',
                                },
                            };
                            browser.runtime.sendMessage(settingsUpdatedCommand);
                        });
                        return;
                }
            });
        }

        this._frame.show();
        return client;
    }

    unbind() {
        this._frame.unbind();
    }
}
