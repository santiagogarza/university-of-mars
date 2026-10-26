import { clearDemoStorage, statusPillClass, type Ticket } from './store';
import { submitTicket } from './services-client';
import { inputField, mountVoiceCall, radioField } from './voice-call';

const resetParams = new URLSearchParams(window.location.search);
if (resetParams.get('reset') === '1') {
  clearDemoStorage();
  resetParams.delete('reset');
  const query = resetParams.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

const SUBCATEGORIES: Record<string, string[]> = {
  'financial-aid': ['Award offer', 'Document status', 'Scholarship', 'Disbursement', 'Work-study'],
  'financial-aid-hold': ['Verification', 'Missing document', 'Satisfactory academic progress', 'Other hold'],
  housing: ['Room assignment', 'Room change', 'Dining', 'Roommate'],
  'housing-repair': ['Plumbing', 'Electrical', 'Heat or cooling', 'Furniture or fixture', 'Pest', 'Other repair'],
  registration: ['Add or drop', 'Transcript', 'Enrollment verification', 'Grade'],
  it: ['Password or sign-in', 'Email', 'Wi-Fi', 'Software'],
  billing: ['Charge question', 'Payment', 'Refund', 'Payment plan'],
  accessibility: ['Accommodation', 'Exam adjustment', 'Barrier on campus', 'Housing accommodation'],
  other: ['General question'],
};

const form = document.querySelector<HTMLFormElement>('#request-form');
const panel = document.querySelector<HTMLElement>('#form-panel');
if (form) {
  const category = form.querySelector<HTMLSelectElement>('#category');
  const subcategory = form.querySelector<HTMLSelectElement>('#subcategory');
  const studentId = form.querySelector<HTMLInputElement>('#student-id');
  const email = form.querySelector<HTMLInputElement>('#email');
  const subject = form.querySelector<HTMLInputElement>('#subject');
  const description = form.querySelector<HTMLTextAreaElement>('#description');
  const attachment = form.querySelector<HTMLInputElement>('#attachment');
  const summary = document.querySelector<HTMLElement>('#form-errors');
  const confirmation = document.querySelector<HTMLElement>('#confirmation');
  const ticketEl = document.querySelector<HTMLElement>('#ticket-number');
  const confirmEmail = document.querySelector<HTMLElement>('#confirm-email');
  const confirmHeading = document.querySelector<HTMLElement>('#confirm-heading');

  function fillSubcategories(...preserve: string[]) {
    if (!category || !subcategory) return;
    const options = SUBCATEGORIES[category.value] ?? [];
    const selected = preserve
      .map((value) => options.find((label) => label.toLowerCase() === value.trim().toLowerCase()))
      .find(Boolean);
    subcategory.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a subcategory';
    subcategory.append(placeholder);
    for (const label of options) {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      if (label === selected) option.selected = true;
      subcategory.append(option);
    }
  }

  category?.addEventListener('change', () => {
    if (!subcategory) return;
    const pending = subcategory.dataset.pending ?? '';
    const current = subcategory.value;
    fillSubcategories(current, pending);
    const chosen = subcategory.value.trim().toLowerCase();
    const pendingApplied = Boolean(pending) && chosen === pending.trim().toLowerCase();
    const keptCurrent = Boolean(current) && chosen === current.trim().toLowerCase();
    if (pendingApplied || keptCurrent) delete subcategory.dataset.pending;
  });
  subcategory?.addEventListener('change', () => {
    if (subcategory) delete subcategory.dataset.pending;
  });

  const grid = form.querySelector('.form-grid');
  const nameInput = document.createElement('input');
  nameInput.id = 'caller-name';
  nameInput.name = 'name';
  nameInput.type = 'text';
  nameInput.autocomplete = 'name';
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'caller-name';
  nameLabel.textContent = 'Name';
  const nameError = document.createElement('p');
  nameError.className = 'field-error';
  nameError.id = 'caller-name-error';
  nameError.hidden = true;
  const nameField = document.createElement('div');
  nameField.className = 'field';
  nameField.append(nameLabel, nameInput, nameError);
  grid?.prepend(nameField);

  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'btn call-launch';
  launch.textContent = 'Talk to Student Support';
  form.before(launch);

  if (category && subcategory && studentId && email && subject && description) {
    mountVoiceCall({
      mode: 'support',
      form,
      launchers: [launch],
      title: 'Student support',
      greeting: 'Student support, this is the University of Mars. How can I help?',
      fields: [
        inputField('name', 'Name', nameInput, false),
        inputField('category', 'Category', category),
        {
          ...inputField('subcategory', 'Subcategory', subcategory),
          set: (value: string) => {
            subcategory.dataset.pending = value;
            const match = [...subcategory.options].find((option) => {
              return (
                option.value.toLowerCase() === value.toLowerCase() ||
                option.textContent?.trim().toLowerCase() === value.toLowerCase()
              );
            });
            if (!match) return;
            subcategory.value = match.value;
            delete subcategory.dataset.pending;
            subcategory.dispatchEvent(new Event('input', { bubbles: true }));
            subcategory.dispatchEvent(new Event('change', { bubbles: true }));
          },
        },
        inputField('studentId', 'Student ID', studentId),
        inputField('email', 'UM email', email),
        inputField('subject', 'Subject', subject),
        inputField('description', 'Description', description),
        radioField('priority', 'Priority', form, 'priority'),
      ],
    });
  }

  const preset = new URLSearchParams(window.location.search).get('category');
  if (preset && category?.querySelector(`option[value="${CSS.escape(preset)}"]`)) {
    category.value = preset;
    fillSubcategories();
  } else {
    fillSubcategories();
  }

  function fieldBox(input: Element | null) {
    return input?.closest<HTMLElement>('.field') ?? null;
  }

  function setError(input: Element | null, message: string) {
    const box = fieldBox(input);
    const error = box?.querySelector<HTMLElement>('.field-error');
    if (box) box.classList.toggle('is-invalid', Boolean(message));
    if (error) {
      error.hidden = !message;
      error.textContent = message;
    }
    if (input instanceof HTMLElement && input.id !== 'student-id') {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (error?.id) input.setAttribute('aria-describedby', error.id);
    }
    return message;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!category || !subcategory || !studentId || !email || !subject || !description) return;

    const errors: { id: string; message: string }[] = [];
    const categoryMessage = category.value ? '' : 'Choose a category.';
    const subcategoryMessage = subcategory.value ? '' : 'Choose a subcategory.';
    const idMessage = /^\d{9}$/.test(studentId.value.trim()) ? '' : 'Enter a 9-digit student ID.';
    const emailMessage = /^[^\s@]+@umars\.edu$/i.test(email.value.trim())
      ? ''
      : 'Enter your UM email ending in @umars.edu.';
    const subjectMessage = subject.value.trim().length >= 4 ? '' : 'Enter a subject of at least a few words.';
    const descriptionMessage =
      description.value.trim().length >= 20 ? '' : 'Describe the request in at least a sentence.';

    if (setError(category, categoryMessage)) errors.push({ id: 'category', message: categoryMessage });
    if (setError(subcategory, subcategoryMessage)) errors.push({ id: 'subcategory', message: subcategoryMessage });
    if (setError(studentId, idMessage)) errors.push({ id: 'student-id', message: idMessage });
    if (setError(email, emailMessage)) errors.push({ id: 'email', message: emailMessage });
    if (setError(subject, subjectMessage)) errors.push({ id: 'subject', message: subjectMessage });
    if (setError(description, descriptionMessage)) errors.push({ id: 'description', message: descriptionMessage });

    let attachmentMessage = '';
    const file = attachment?.files?.[0];
    if (file) {
      const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
      if (file.size > 5 * 1024 * 1024) attachmentMessage = 'Attachments must be 5 MB or smaller.';
      else if (file.type && !allowed.includes(file.type)) {
        attachmentMessage = 'Attach a PDF, PNG, or JPG.';
      }
    }
    if (setError(attachment ?? null, attachmentMessage)) {
      errors.push({ id: 'attachment', message: attachmentMessage });
    }

    const priority = form.querySelector<HTMLInputElement>('input[name="priority"]:checked');
    if (!priority) errors.push({ id: 'priority-normal', message: 'Choose a priority.' });

    if (!summary) return;
    summary.hidden = errors.length === 0;
    summary.replaceChildren();
    if (errors.length) {
      const lead = document.createElement('p');
      lead.textContent = 'Check the highlighted fields and submit the request again.';
      const list = document.createElement('ul');
      for (const item of errors) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${item.id}`;
        link.textContent = item.message;
        li.append(link);
        list.append(li);
      }
      summary.append(lead, list);
      summary.focus();
      return;
    }

    let ticket: Ticket;
    try {
      ticket = await submitTicket({
        category: category.value,
        subcategory: subcategory.value,
        studentId: studentId.value.trim(),
        email: email.value.trim(),
        subject: subject.value.trim(),
        description: description.value.trim(),
        priority: priority?.value || 'Normal',
        attachmentName: file?.name ?? null,
        ...(nameInput.value.trim() ? { name: nameInput.value.trim() } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request could not be sent.';
      summary.hidden = false;
      summary.replaceChildren();
      const lead = document.createElement('p');
      lead.textContent = message;
      summary.append(lead);
      summary.focus();
      return;
    }

    const callPanel = document.querySelector<HTMLElement>('.call-panel');
    if (callPanel?.dataset.callState === 'live' || callPanel?.dataset.callState === 'connecting') {
      document.querySelector<HTMLButtonElement>('.call-hangup')?.click();
    }

    if (ticketEl) ticketEl.textContent = ticket.id;
    confirmation?.querySelectorAll('.confirm-status').forEach((node) => node.remove());
    const pill = document.createElement('p');
    pill.className = 'confirm-status';
    const badge = document.createElement('span');
    badge.className = statusPillClass(ticket.status);
    badge.textContent = ticket.status;
    pill.append(badge);
    ticketEl?.insertAdjacentElement('afterend', pill);
    if (confirmEmail) confirmEmail.textContent = ticket.email;
    if (panel) panel.hidden = true;
    else form.hidden = true;
    if (confirmation) {
      confirmation.hidden = false;
      confirmation.scrollIntoView({ block: 'start' });
      confirmHeading?.focus({ preventScroll: true });
    }
  });

  document.querySelector('#another-request')?.addEventListener('click', (event) => {
    event.preventDefault();
    form.reset();
    if (category) category.value = '';
    fillSubcategories();
    form.querySelectorAll('.field').forEach((box) => {
      box.classList.remove('is-invalid');
      const error = box.querySelector<HTMLElement>('.field-error');
      if (error) {
        error.hidden = true;
        error.textContent = '';
      }
    });
    form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((input) => {
      if (input.id !== 'student-id') input.setAttribute('aria-invalid', 'false');
    });
    if (summary) {
      summary.hidden = true;
      summary.replaceChildren();
    }
    if (confirmation) confirmation.hidden = true;
    if (panel) panel.hidden = false;
    else form.hidden = false;
    const heading = document.querySelector<HTMLElement>('#request-heading');
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  });
}
