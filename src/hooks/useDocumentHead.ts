import { useEffect } from 'react';

const SITE_NAME = 'StageNation';
const BASE_URL = 'https://stagenation.be';
const DEFAULT_IMAGE = `${BASE_URL}/og-stagenation.png?v=sn-20260428`;

interface HeadOptions {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: string;
}

function setMeta(property: string, content: string, isName = false) {
  const attr = isName ? 'name' : 'property';
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

export function useDocumentHead({ title, description, path = '/', image, type = 'website' }: HeadOptions) {
  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`;
    const fullUrl = `${BASE_URL}${path}`;
    const img = image || DEFAULT_IMAGE;

    document.title = fullTitle;

    setMeta('description', description, true);
    setMeta('og:title', fullTitle);
    setMeta('og:description', description);
    setMeta('og:url', fullUrl);
    setMeta('og:image', img);
    setMeta('og:type', type);
    setMeta('og:site_name', SITE_NAME);
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image', img);
    setCanonical(fullUrl);
  }, [title, description, path, image, type]);
}
