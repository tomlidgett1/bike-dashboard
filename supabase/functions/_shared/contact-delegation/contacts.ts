import { searchContactsTool, type NormalisedContact } from '../contacts-helpers.ts';
import { normaliseToE164 } from '../phone-normalise.ts';
import type { DelegationContactChoice } from './types.ts';

function contactPhones(contact: NormalisedContact): Array<{ original: string; e164: string }> {
  const phones: Array<{ original: string; e164: string }> = [];
  for (const phone of contact.phones) {
    const e164 = normaliseToE164(phone);
    if (e164) phones.push({ original: phone, e164 });
  }
  return phones;
}

export async function resolveDelegationContact(params: {
  authUserId: string | null;
  contactQuery: string | null;
  directPhone: string | null;
  recipientName?: string | null;
}): Promise<DelegationContactChoice | null> {
  if (params.directPhone) {
    return {
      targetHandle: params.directPhone,
      targetDisplayName: params.recipientName?.trim() || null,
      selectedPhoneE164: params.directPhone,
      originalPhone: params.directPhone,
      selectedContactResourceName: null,
      selectedContactAccount: null,
      selectedContactProvider: null,
    };
  }

  if (!params.authUserId || !params.contactQuery) {
    return null;
  }

  const contacts = await searchContactsTool(params.authUserId, {
    query: params.contactQuery,
    maxResults: 5,
  });

  const withPhones = contacts
    .map((contact) => ({ contact, phones: contactPhones(contact) }))
    .filter((entry) => entry.phones.length > 0);

  if (withPhones.length === 0) return null;

  if (withPhones.length > 1 || withPhones[0].phones.length > 1) {
    return {
      targetHandle: '',
      targetDisplayName: null,
      selectedPhoneE164: '',
      originalPhone: null,
      selectedContactResourceName: null,
      selectedContactAccount: null,
      selectedContactProvider: null,
      ambiguityReason: withPhones.length > 1 ? 'multiple_contacts' : 'multiple_phone_numbers',
      alternatives: withPhones.map(({ contact, phones }) => ({
        name: contact.name,
        phones: phones.map((p) => p.e164),
        account: contact.account,
        provider: contact.provider,
        resourceName: contact.resourceName,
      })),
    };
  }

  const selected = withPhones[0];
  const phone = selected.phones[0];
  return {
    targetHandle: phone.e164,
    targetDisplayName: selected.contact.name,
    selectedPhoneE164: phone.e164,
    originalPhone: phone.original,
    selectedContactResourceName: selected.contact.resourceName,
    selectedContactAccount: selected.contact.account,
    selectedContactProvider: selected.contact.provider,
  };
}

export function formatContactAmbiguity(choice: DelegationContactChoice, label: string): string {
  if (!choice.alternatives?.length) {
    return `I couldn't find a phone number for ${label}. Can you send me their number?`;
  }
  const options = choice.alternatives
    .slice(0, 4)
    .map((alt, index) => {
      const name = alt.name ?? label;
      const phones = alt.phones.join(', ');
      return `${index + 1}. ${name}: ${phones}`;
    })
    .join('\n');
  return `I found a few possible matches for ${label}. Which one should I message?\n${options}`;
}
