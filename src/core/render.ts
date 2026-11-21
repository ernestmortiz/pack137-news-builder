/**
 * Announcement renderer (build spec, sections 6.1 and 7.3). A pure function from a form to an HTML
 * string. No DOM, no network. Pretty-printed with 2-space indentation.
 */
import type { AnnouncementForm } from './forms';
import { callToActionBody } from '../templates/announcement/call-to-action';
import { dateListBody } from '../templates/announcement/date-list';
import { helpWantedBody } from '../templates/announcement/help-wanted';
import { linkListBody } from '../templates/announcement/link-list';
import { messageBody } from '../templates/announcement/message';
import { cardShell } from '../templates/components';

function bodyFor(form: AnnouncementForm): string {
  switch (form.layout) {
    case 'message':
      return messageBody(form);
    case 'call-to-action':
      return callToActionBody(form);
    case 'link-list':
      return linkListBody(form);
    case 'date-list':
      return dateListBody(form);
    case 'help-wanted':
      return helpWantedBody(form);
  }
}

export function renderAnnouncement(form: AnnouncementForm): string {
  return cardShell(form.label, form.title, bodyFor(form)) + '\n';
}
