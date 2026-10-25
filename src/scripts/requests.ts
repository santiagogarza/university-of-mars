import { loadTickets, removeTicket } from './store';
import { u } from '../lib/paths';

const list = document.querySelector<HTMLElement>('#request-list');
const empty = document.querySelector<HTMLElement>('#request-empty');
if (list && empty) {
  const render = () => {
    const tickets = loadTickets();
    list.replaceChildren();
    empty.hidden = tickets.length > 0;
    list.hidden = tickets.length === 0;
    for (const ticket of tickets) {
      const item = document.createElement('li');
      item.className = 'request-item';

      const header = document.createElement('header');
      const id = document.createElement('p');
      id.className = 'request-id';
      id.textContent = ticket.id;
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = ticket.status;
      header.append(id, pill);

      const title = document.createElement('h2');
      title.textContent = ticket.subject;

      const meta = document.createElement('p');
      const when = new Date(ticket.createdAt);
      const date = Number.isNaN(when.getTime())
        ? ''
        : when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      meta.textContent = `${ticket.categoryLabel} · ${ticket.subcategory} · ${ticket.priority} · ${date}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'linkish';
      remove.textContent = 'Remove from this browser';
      remove.addEventListener('click', () => {
        removeTicket(ticket.id);
        render();
      });

      item.append(header, title, meta, remove);
      list.append(item);
    }
  };

  const another = document.querySelector<HTMLAnchorElement>('#new-request');
  if (another) another.href = u('/support/#request');
  render();
}
