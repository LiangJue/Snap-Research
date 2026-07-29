import { getManifest, getURL } from '@services/shared/runtime';
import { tabsCreate } from '@services/shared/webext';

import { t } from '@i18n';
import { buttonClassName, cardClassName } from '@ui/settings/ui';

export function AboutSection() {
  const version = (() => {
    try {
      const manifest = getManifest();
      return String(manifest?.version || '');
    } catch (_e) {
      return '';
    }
  })();

  const openUrl = async (url: string) => {
    await tabsCreate({ url });
  };

  return (
    <>
      <section className={cardClassName} aria-label={t('aboutSectionAria')}>
        <div className="tw-flex tw-items-center tw-gap-3">
          <img
            className="tw-size-10 tw-rounded-2xl tw-object-contain"
            src={getURL('icons/icon-128.png' as any)}
            alt=""
            draggable={false}
          />
          <div className="tw-min-w-0 tw-flex-1">
            <div className="tw-text-base tw-font-black tw-text-[var(--text-primary)]">Snap Research</div>
            <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-text-[var(--text-secondary)]" id="aboutVersion">
              {version ? `${t('versionPrefix')} ${version}` : t('versionPrefix')}
            </div>
          </div>
        </div>

        <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2" aria-label={t('linksAria')}>
          <button
            id="btnAboutSource"
            className={buttonClassName}
            type="button"
            onClick={() => openUrl('https://github.com/LiangJue/Snap-Research').catch(() => {})}
          >
            {t('sourceCode')}
          </button>
          <button
            id="btnAboutChangelog"
            className={buttonClassName}
            type="button"
            onClick={() => openUrl('https://github.com/LiangJue/Snap-Research/releases').catch(() => {})}
          >
            {t('changelog')}
          </button>
        </div>
      </section>

      <section className={cardClassName} aria-label={t('upstreamSectionAria')}>
        <div className="tw-flex tw-items-center tw-gap-3">
          <div className="tw-min-w-0 tw-flex-1">
            <div className="tw-text-sm tw-font-black tw-text-[var(--text-primary)]">SyncNos WebClipper</div>
            <div className="tw-mt-0.5 tw-text-xs tw-font-semibold tw-text-[var(--text-secondary)]">
              {t('upstreamCredit')}
            </div>
          </div>
        </div>

        <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
          <button
            id="btnAboutUpstream"
            className={buttonClassName}
            type="button"
            onClick={() => openUrl('https://github.com/SyncNos/SyncNos-Webclipper').catch(() => {})}
          >
            {t('upstreamSource')}
          </button>
        </div>
      </section>
    </>
  );
}
