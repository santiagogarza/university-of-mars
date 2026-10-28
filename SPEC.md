# University of Mars

A fictional university website for a workshop. Every name, phone number, address, and person is made up. Students and staff use it to find answers and ask for help, and the workshop uses it as the live demo.

Anyone can read about the university, search, or send a Help Center request. Housing and the Help Center also take a call in the browser. The call fills the form as the person talks, and they still press Submit. Replies follow the language being spoken, including a switch from English to Spanish and back. Saved answers stay in English. If the caller uses another language at any point, the description gets one line, `Caller language: Spanish` (or that language), added once and not repeated.

Public pages are home, about, academics, the calendar, admissions, financial aid, housing, research, faculty, students, parents, alumni, giving, and three news stories, plus accessibility, privacy, Title IX, emergency, search, a campus directory, and a mock sign-in. A search palette (Ctrl K or ⌘K) on every page finds pages, help articles, news, people, and quick actions. The Help Center has six articles (password, registration, billing, an aid hold, a housing repair, and accommodations) and the request form. My requests lists submitted tickets. Booked repairs and the Title IX case log are staff pages, not in the public menu.

A typed form or a finished call becomes a ticket. When forwarding is on, the Intake bot receives it. The bot reads the queue, updates tickets, comments, and groups duplicate aid-hold requests under the oldest one. A bot can book a housing repair. An aid-hold release waits until someone on the approver list agrees. Staff keep the Title IX log, and workshop bots can read and update it.

Five mistakes stay in the pages for the demo. A nightly accessibility check and a weekly dependency check only report what they find.

Details are in [Technical notes](docs/TECHNICAL.md).
