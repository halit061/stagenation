import { useEffect } from 'react';

const JSONLD_ID = 'stagenation-jsonld';

interface JsonLdProps {
  page: string;
  eventName?: string;
  eventDate?: string;
  eventDescription?: string;
}

function buildOrganization() {
  return {
    '@type': 'Organization',
    '@id': 'https://stagenation.be/#organization',
    name: 'StageNation',
    url: 'https://stagenation.be',
    logo: {
      '@type': 'ImageObject',
      url: 'https://stagenation.be/stagenation-logo-512.png',
    },
    sameAs: [
      'https://www.instagram.com/stagenation.be',
      'https://www.facebook.com/profile.php?id=61588941385113',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'info@stagenation.be',
      contactType: 'customer service',
      availableLanguage: ['Dutch', 'Turkish', 'French', 'German'],
    },
  };
}

function buildLocalBusiness() {
  return {
    '@type': 'EventVenue',
    '@id': 'https://stagenation.be/#venue',
    name: 'StageNation',
    url: 'https://stagenation.be',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Genk',
      addressRegion: 'Limburg',
      addressCountry: 'BE',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 50.9655,
      longitude: 5.5005,
    },
  };
}

function buildBreadcrumbs(page: string) {
  const items: { name: string; url: string }[] = [
    { name: 'Home', url: 'https://stagenation.be/' },
  ];

  const pageMap: Record<string, string> = {
    agenda: 'Agenda',
    tickets: 'Tickets',
    location: 'Locatie',
    gallery: 'Galerie',
    contact: 'Contact',
    info: 'Info',
    archive: 'Archief',
  };

  if (page !== 'home' && pageMap[page]) {
    items.push({ name: pageMap[page], url: `https://stagenation.be/${page}` });
  }

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function buildEvent(name?: string, date?: string, description?: string) {
  if (!name) return null;
  return {
    '@type': 'Event',
    name,
    description: description || `${name} — StageNation`,
    startDate: date || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@id': 'https://stagenation.be/#venue' },
    organizer: { '@id': 'https://stagenation.be/#organization' },
    offers: {
      '@type': 'Offer',
      url: 'https://stagenation.be/tickets',
      availability: 'https://schema.org/InStock',
      priceCurrency: 'EUR',
    },
  };
}

export function JsonLd({ page, eventName, eventDate, eventDescription }: JsonLdProps) {
  useEffect(() => {
    const graph: object[] = [
      buildOrganization(),
      buildLocalBusiness(),
      buildBreadcrumbs(page),
    ];

    if (page === 'tickets' || page === 'home') {
      const event = buildEvent(eventName, eventDate, eventDescription);
      if (event) graph.push(event);
    }

    const schema = {
      '@context': 'https://schema.org',
      '@graph': graph,
    };

    let script = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = JSONLD_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);

    return () => {
      const el = document.getElementById(JSONLD_ID);
      if (el) el.remove();
    };
  }, [page, eventName, eventDate, eventDescription]);

  return null;
}
