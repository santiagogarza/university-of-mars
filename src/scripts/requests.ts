import { clearDemoStorage, loadTickets, publicComments, removeTicket, statusPillClass } from './store';
import { refreshTickets } from './services-client';
import { u } from '../lib/paths';

const resetParams = new URLSearchParams(window.location.search);
if (resetParams.get('reset') === '1') {
  clearDemoStorage();
  resetParams.delete('reset');
  const query = resetParams.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

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
      pill.className = statusPillClass(ticket.status);
      pill.textContent = ticket.status;
      header.append(id, pill);

      const title = document.createElement('h2');
      title.textContent = ticket.subject;

      const meta = document.createElement('p');
      const when = new Date(ticket.updatedAt || ticket.createdAt);
      const date = Number.isNaN(when.getTime())
        ? ''
        : when.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      meta.textContent = `${ticket.categoryLabel} · ${ticket.subcategory} · ${ticket.priority} · ${date}`;

      item.append(header, title, meta);
      if (ticket.assignee) {
        const assignee = document.createElement('p');
        assignee.textContent = `Assigned to ${ticket.assignee}`;
        item.append(assignee);
      }
      if (ticket.note) {
        const note = document.createElement('p');
        note.textContent = ticket.note;
        item.append(note);
      }
      const comments = publicComments(ticket);
      if (comments.length) {
        const thread = document.createElement('ul');
        thread.className = 'comment-list';
        for (const comment of comments) {
          const row = document.createElement('li');
          const who = document.createElement('strong');
          who.textContent = comment.author;
          row.append(who, document.createTextNode(` ${comment.body}`));
          thread.append(row);
        }
        item.append(thread);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'linkish';
      remove.textContent = 'Remove from this browser';
      remove.addEventListener('click', () => {
        removeTicket(ticket.id);
        render();
      });

      item.append(remove);
      list.append(item);
    }
  };

  const another = document.querySelector<HTMLAnchorElement>('#new-request');
  if (another) another.href = u('/support/#request');
  render();
  const poll = () => {
    void refreshTickets().then(render);
  };
  poll();
  window.setInterval(poll, 8000);
}
