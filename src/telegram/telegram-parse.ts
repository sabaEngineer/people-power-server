export type ParsedContact = {
  firstName: string;
  lastName: string;
  phone?: string;
  birthday?: string;
  socialUrl?: string;
  description?: string;
  tags: string[];
};

const FIELD_KEYS: Record<string, keyof Omit<ParsedContact, 'firstName' | 'lastName' | 'tags'>> = {
  phone: 'phone',
  tel: 'phone',
  birthday: 'birthday',
  bday: 'birthday',
  dob: 'birthday',
  instagram: 'socialUrl',
  social: 'socialUrl',
  url: 'socialUrl',
  link: 'socialUrl',
  note: 'description',
  notes: 'description',
  description: 'description',
  about: 'description',
};

export function isAddCommand(text: string): boolean {
  const t = text.trim();
  return /^\/add(?:@\w+)?(?:\s|$)/i.test(t) || /^add\s+/i.test(t);
}

export function parseAddText(text: string): ParsedContact | { error: string } {
  let rest = text.trim();
  rest = rest.replace(/^\/add(?:@\w+)?\s*/i, '');
  rest = rest.replace(/^add\s+/i, '');
  if (!rest) {
    return {
      error:
        'Send a name. Example:\n/add Jane Doe\nphone: +995...\nbirthday: 1994-03-21\nnote: met at a conference',
    };
  }

  const chunks = rest
    .split(/\n|\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nameChunk = chunks[0].replace(/^name:\s*/i, '');
  if (!nameChunk || isFieldChunk(nameChunk)) {
    return { error: 'Start with the person’s name, e.g. /add Jane Doe' };
  }

  const nameWords = nameChunk.split(/\s+/).filter(Boolean);
  const firstName = nameWords[0];
  const lastName = nameWords.slice(1).join(' ') || '-';
  const parsed: ParsedContact = { firstName, lastName, tags: [] };

  for (const chunk of chunks.slice(1)) {
    const match =
      chunk.match(/^([a-z]+)\s*[:=]\s*(.+)$/i) ??
      chunk.match(
        /^(phone|tel|birthday|bday|dob|instagram|social|url|link|note|notes|description|about|tag|tags)\s+(.+)$/i,
      );
    if (!match) {
      parsed.description = joinText(parsed.description, chunk);
      continue;
    }
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!value) continue;

    if (key === 'tag' || key === 'tags') {
      parsed.tags.push(
        ...value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      );
      continue;
    }

    const field = FIELD_KEYS[key];
    if (field === 'birthday') {
      const iso = parseBirthday(value);
      if (!iso) {
        return { error: `Could not read birthday "${value}". Use YYYY-MM-DD, e.g. 1994-03-21` };
      }
      parsed.birthday = iso;
      continue;
    }
    if (field) {
      parsed[field] = value;
      continue;
    }
    parsed.description = joinText(parsed.description, chunk);
  }

  return parsed;
}

function isFieldChunk(chunk: string): boolean {
  return /^(phone|tel|birthday|bday|dob|instagram|social|url|link|note|notes|description|about|tag|tags)\s*:/i.test(
    chunk,
  );
}

function joinText(existing: string | undefined, extra: string): string {
  return existing ? `${existing}\n${extra}` : extra;
}

export function parseBirthday(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dotted = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotted) return toIso(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));

  return null;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
