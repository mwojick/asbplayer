import FrameBridgeClient, { FetchOptions } from './frame-bridge-client';
import { IframeContentScriptUi } from 'wxt/utils/content-script-ui/iframe';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { HtmlPublicPath } from 'wxt/browser';

const frameColorScheme = () => {
    // Prevent iframe from showing up with solid background by selecting suitable color scheme according to document's color scheme
    // https://fvsch.com/transparent-iframes

    const documentColorSchemeMetaTag = document.querySelector('meta[name="color-scheme"]');

    if (documentColorSchemeMetaTag === null) {
        return 'normal';
    }

    const documentColorScheme = (documentColorSchemeMetaTag as HTMLMetaElement).content;
    const light = documentColorScheme.includes('light');
    const dark = documentColorScheme.includes('dark');

    if (light && dark) {
        return 'none';
    }

    if (light) {
        return 'light';
    }

    if (dark) {
        return 'dark';
    }

    return 'normal';
};

export default class UiFrame {
    private readonly _path: string;
    private _fetchOptions: FetchOptions | undefined;
    private _client: FrameBridgeClient | undefined;
    private _frame: HTMLIFrameElement | undefined;
    private _ctx: ContentScriptContext;
    private _ui: IframeContentScriptUi<void> | undefined;
    private _language: string = 'en';
    private _dirty = true;
    private _bound = false;

    constructor(ctx: ContentScriptContext, path: string) {
        this._ctx = ctx;
        this._path = path;
    }

    set fetchOptions(fetchOptions: FetchOptions) {
        this._dirty =
            this._dirty ||
            this._fetchOptions?.allowedFetchUrl !== fetchOptions.allowedFetchUrl ||
            this._fetchOptions?.videoSrc !== fetchOptions.videoSrc;
        this._fetchOptions = fetchOptions;
    }

    set language(language: string) {
        this._dirty = this._dirty || this._language !== language;
        this._language = language;
    }

    get hidden() {
        return this._frame === undefined || this._frame.classList.contains('asbplayer-hide');
    }

    get bound() {
        return this._bound;
    }

    get frame() {
        return this._frame;
    }

    get clientIfLoaded() {
        return this._client;
    }

    async bind(): Promise<boolean> {
        return await this._init();
    }

    async client() {
        await this._init();
        return this._client!;
    }

    private async _init() {
        if (!this._dirty) {
            return false;
        }

        this._dirty = false;
        this._bound = true;
        this._client?.unbind();
        this._ui?.remove();

        this._ui = createIframeUi(this._ctx, {
            page: `${this._path}?lang=${this._language}` as HtmlPublicPath,
            position: 'inline',
            anchor: 'body',
            onMount: (wrapper, iframe) => {
                iframe.className = 'asbplayer-ui-frame';
                iframe.style.colorScheme = frameColorScheme();
                iframe.setAttribute('allowtransparency', 'true');
            },
        });

        this._ui.mount();

        this._frame = this._ui.iframe;
        this._client = new FrameBridgeClient(this._frame, this._fetchOptions);
        await this._client!.bind();
        return true;
    }

    show() {
        this._frame?.classList.remove('asbplayer-hide');
    }

    hide() {
        this._frame?.classList.add('asbplayer-hide');
        this._frame?.blur();
    }

    unbind() {
        this._dirty = true;
        this._client?.unbind();
        this._ui?.remove();
    }
}
