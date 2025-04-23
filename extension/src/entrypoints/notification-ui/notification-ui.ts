import FrameBridgeServer from '@/services/frame-bridge-server';
import { renderNotificationUi } from '@/ui/notification';
import { fetchLocalization } from '@/services/localization-fetcher';

const root = document.getElementById('root')!;

const urlParams = new URLSearchParams(window.location.search);
const language = urlParams.get('language') || 'en';

const loc = await fetchLocalization(language);

const bridge = renderNotificationUi(root, loc.lang, loc.strings);
const listener = new FrameBridgeServer(bridge);
listener.bind();

window.addEventListener('unload', (e) => {
    listener.unbind();
});
