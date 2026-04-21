interface Window {
  __PRERENDER_INJECTED?: {
    isPrerendering: boolean;
  };
  fbq?: (...args: any[]) => void;
}
