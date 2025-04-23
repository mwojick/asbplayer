import FrameBridgeServer from '@/services/frame-bridge-server';
import { renderAnkiUi } from '@/ui/anki';
import { fetchLocalization } from '@/services/localization-fetcher';

const root = document.getElementById('root')!;

const urlParams = new URLSearchParams(window.location.search);
const language = urlParams.get('language') || 'en';

const loc = await fetchLocalization(language);

const bridge = renderAnkiUi(root, loc.lang, loc.strings);
const listener = new FrameBridgeServer(bridge);
listener.bind();

window.addEventListener('unload', (e) => {
    listener.unbind();
});
