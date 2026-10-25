import { addTicket, loadTickets, newTicketId, type Ticket } from './store';

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

  function fillSubcategories(preserve = '') {
    if (!category || !subcategory) return;
    const options = SUBCATEGORIES[category.value] ?? [];
    subcategory.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a subcategory';
    subcategory.append(placeholder);
    for (const label of options) {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      if (label === preserve) option.selected = true;
      subcategory.append(option);
    }
  }

  category?.addEventListener('change', () => fillSubcategories());

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

  form.addEventListener('submit', (event) => {
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

    const option = category.selectedOptions[0];
    const ticket: Ticket = {
      id: newTicketId(loadTickets().map((item) => item.id)),
      category: category.value,
      categoryLabel: option?.textContent?.trim() || category.value,
      subcategory: subcategory.value,
      studentId: studentId.value.trim(),
      email: email.value.trim(),
      subject: subject.value.trim(),
      description: description.value.trim(),
      priority: priority?.value || 'Normal',
      attachmentName: file?.name ?? null,
      createdAt: new Date().toISOString(),
      status: 'Submitted',
    };
    addTicket(ticket);

    if (ticketEl) ticketEl.textContent = ticket.id;
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
