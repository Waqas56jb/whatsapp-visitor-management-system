// Messages of the Corporate Office chat flow, in English and Setswana. {name} placeholders are
// filled by ft(). Lists are built by the flow from the option tables below.
import { normalizeLang } from './lang.js';

const EN = {
  'welcome.new':
    "Welcome to {company}! 👋\nI'm your virtual assistant. I can help you register a visit, book appointments, give feedback, request services, or answer your questions.\n\nBefore we begin, let's create your profile.",
  'welcome.back': '👋 Welcome back, {first}!',
  'profile.askName': 'Please enter your full name:',
  'profile.badName': 'Please enter your full name (first name and surname), for example: John Smith.',
  'profile.askType': 'Are you visiting as:\n1️⃣ Organisation\n2️⃣ Individual\n3️⃣ Other',
  'profile.askCompany': 'Please enter your company / organisation name:',
  'profile.askOther': 'Please tell us who you represent (for example: student, government official, contractor):',
  'profile.askEmail': 'Please enter your email address (optional).\nReply *SKIP* to continue without one.',
  'profile.badEmail': "That doesn't look like an email address. Please enter a valid email, or reply *SKIP*.",
  'profile.done': '✅ Profile created successfully! Thank you, {first}.',

  'menu.title': 'How can we help you today?',
  'menu.register': 'Visitor Registration',
  'menu.appointment': 'Make an Appointment',
  'menu.feedback': 'Give Feedback',
  'menu.service': 'Request a Service',
  'menu.ask': 'Ask a Question',
  'menu.footer': 'Reply with a number.\nType *MENU* anytime to return here, or *HELP* for all commands.',
  'menu.invalid': 'Please reply with one of the numbers below.',

  'help.text':
    'You can type these commands at any time:\n\n*MENU* – main menu\n*APPOINTMENT* – view or change your bookings\n*STATUS* – check your requests\n*BACK* – go back one step\n*CANCEL* – stop what you are doing\n*HUMAN* or *AGENT* – talk to a staff member\n*SETSWANA* / *ENGLISH* – change language\n*END* – end the conversation',
  'cmd.cancelled': 'Okay, I have cancelled that.',
  'cmd.nothingToCancel': 'There is nothing in progress to cancel.',
  'cmd.cantGoBack': "We're at the start, there's nothing to go back to.",
  'cmd.lang': 'Language set to English.',
  'end.text': 'Thank you for contacting {company}! 😊\nHave a great day.\n\nType *HI* anytime to start again.',

  'common.yesNo': '1️⃣ Yes\n2️⃣ No',
  'common.pickNumber': 'Please reply with a number from the list.',
  'common.confirmOptions': '1️⃣ Confirm\n2️⃣ Change details\n3️⃣ Cancel',
  'common.unavailable': 'Sorry, this service is not available right now. Type *MENU* to see the options.',
  'common.error': 'Sorry, something went wrong on our side. Please try again in a moment.',

  'reg.askHost': "Who are you visiting?\nPlease enter the host's name or department.",
  'reg.hostFound': 'I found *{host}*{deptLine}{officeLine}\n\nIs this the person you are visiting?\n1️⃣ Yes\n2️⃣ No',
  'reg.hostMany': 'I found several matches. Who are you visiting?\n{list}\n\nReply with a number.',
  'reg.hostNone': "I couldn't find \"{query}\" in our directory. Please check the spelling, or enter a department.",
  'reg.hostDirectory': "I still couldn't find that person. Here is our directory:\n{list}\n\nReply with a number, or type a name.",
  'reg.hostNoneAtAll': 'Sorry, no hosts are available for visits at the moment. Please contact reception.',
  'reg.hostRetry': 'No problem. Please enter the name or department of the person you are visiting.',
  'reg.askPurpose': 'What is the purpose of your visit?\n{list}',
  'reg.askPurposeOther': 'Please describe the purpose of your visit:',
  'reg.askDate': 'What date will you visit?\nFor example: *tomorrow*, *Monday* or *25/10/2026*.',
  'reg.badDate': "I couldn't read that date. Please send a date like *tomorrow*, *Friday* or *25/10/2026*.",
  'reg.pastDate': 'That date has already passed. Please choose today or a future date.',
  'reg.closedDay': "We're closed on {date}. Please choose another day.\nOur hours:\n{hours}",
  'reg.askTime': 'What time will you arrive on {date}?\nOffice hours: {open} – {close}.{slots}',
  'reg.slotsLine': '\nAvailable times: {slots}',
  'reg.badTime': "I couldn't read that time. Please send a time like *10:00* or *2pm*.",
  'reg.closedTime': 'That time is outside office hours ({open} – {close}). Please choose another time.',
  'reg.pastTime': 'That time has already passed today. Please choose a later time.',
  'reg.slotTaken': '{host} already has a visit at that time. Free times on {date}: {slots}\nPlease choose one.',
  'reg.noSlots': '{host} has no free times left on {date}. Please choose another date.',
  'reg.askId': '🪪 For security, please upload a clear photo of your ID card or passport.',
  'reg.needIdFile': 'Please send a *photo* or *PDF* of your ID document to continue, or type *CANCEL*.',
  'reg.idSaved': '✅ ID document received.',
  'reg.askNda': '📄 Please read our visitor confidentiality agreement:\n\n{nda}\n\nReply *I AGREE* to accept, or *CANCEL* to stop.',
  'reg.needAgree': 'To continue you must reply *I AGREE*, or type *CANCEL*.',
  'reg.healthIntro': '🩺 A short health screening ({count} questions).',
  'reg.healthQ': '{n}. {question}\n1️⃣ Yes\n2️⃣ No',
  'reg.summary':
    'Please confirm your visit:\n\n👤 Name: {name}\n🏢 Company: {company}\n🙋 Host: {host}\n📝 Purpose: {purpose}\n📅 Date: {date}\n🕐 Time: {time}\n\n1️⃣ Confirm\n2️⃣ Change details\n3️⃣ Cancel',
  'reg.sent':
    '✅ Your visit request has been sent to *{host}* for approval.\nReference: *{ref}*\n\nYou will receive a notification here once your host responds.',
  'reg.flaggedNote': '\n\nReception will review your health screening answers before your visit.',
  'reg.limit': 'Sorry, we cannot accept new visit requests online right now. Please contact reception.',

  'appt.askWith': 'Who would you like to meet?\nPlease enter a person, department or service.',
  'appt.askTopic': 'What would you like to discuss?',
  'appt.askType': 'What type of appointment is this?\n{list}',
  'appt.summary':
    'Please confirm your appointment:\n\n🙋 With: {host}\n📌 Type: {type}\n💬 Topic: {topic}\n📅 Date: {date}\n🕐 Time: {time}\n\n1️⃣ Confirm\n2️⃣ Change details\n3️⃣ Cancel',
  'appt.sent':
    '📅 Your appointment request has been sent to *{host}*.\nReference: *{ref}*\n\nOnce it is confirmed you will receive a confirmation and a calendar invite here, and a reminder 1 hour before.',

  'manage.none': "You don't have any upcoming visits or appointments.\nType *MENU* to book one.",
  'manage.list': 'Your upcoming bookings:\n{list}\n\nReply with a number to manage it.',
  'manage.options': '*{ref}* – {kind} with {host}\n{date} at {time} · {status}\n\n1️⃣ Reschedule\n2️⃣ Cancel\n3️⃣ View details\n4️⃣ Add to calendar\n5️⃣ Return to menu',
  'manage.details':
    'Reference: {ref}\nType: {kind}\nHost: {host}{deptLine}{officeLine}\nPurpose: {purpose}\nDate: {date}\nTime: {time}\nStatus: {status}{pinLine}',
  'manage.cancelConfirm': 'Cancel {kindLower} *{ref}* on {date} at {time}?\n1️⃣ Yes, cancel it\n2️⃣ No, keep it',
  'manage.cancelled': '❌ {kind} *{ref}* has been cancelled. {host} has been informed.',
  'manage.kept': 'Okay, your booking is unchanged.',
  'manage.rescheduled': '🔄 *{ref}* has been moved to {date} at {time}. {host} has been asked to confirm the new time.',
  'manage.cantChange': "This booking can't be changed any more (it is {status}).",
  'manage.calendarSent': '📅 Here is your calendar invite.',
  'kind.visit': 'Visit',
  'kind.appointment': 'Appointment',

  'fb.askTopic': 'What would you like to give feedback about?\n{list}',
  'fb.askComment': 'Please share your feedback:',
  'fb.askRating': 'How would you rate your experience?\nReply with a number from 1 to 5 ⭐\n(1 = very poor, 5 = excellent)',
  'fb.badRating': 'Please reply with a number from 1 to 5.',
  'fb.thanks': '🙏 Thank you for your feedback!\nReference: *{ref}*',
  'fb.askComplaint': "We're sorry to hear that. 😔\nPlease describe your complaint:",
  'fb.askContact': 'Would you like a staff member to contact you about this?\n1️⃣ Yes\n2️⃣ No',
  'fb.complaintSaved': 'Your complaint has been recorded and escalated to our team.\nReference: *{ref}*{contactLine}',
  'fb.contactLine': '\nA staff member will contact you shortly.',
  'fb.offerAfterVisit': 'Thank you for visiting {company}! 👋\nWould you like to give feedback on your visit?\n1️⃣ Yes\n2️⃣ No',
  'fb.noThanks': 'No problem. Have a great day! Type *MENU* anytime.',

  'svc.askCategory': 'What type of service do you need?\n{list}',
  'svc.askDescribe': 'Please describe your request:',
  'svc.askPriority': 'What is the priority?\n{list}',
  'svc.askAttach': 'Would you like to attach a file or photo?\n1️⃣ Yes\n2️⃣ No',
  'svc.askFile': 'Please send the file or photo now.',
  'svc.needFile': 'Please send a photo or document, or reply *SKIP* to continue without one.',
  'svc.fileSaved': '📎 File attached.',
  'svc.summary': 'Please confirm your service request:\n\n🔧 Type: {category}\n📝 Details: {description}\n⚡ Priority: {priority}{fileLine}\n\n1️⃣ Submit\n2️⃣ Change details\n3️⃣ Cancel',
  'svc.fileLine': '\n📎 Attachment: yes',
  'svc.sent': '✅ Your service request has been submitted.\nTicket number: *{ref}*\n\nWe will notify you here when the status changes. Type *STATUS* to check it anytime.',
  'svc.update': '🔔 Update on your service request *{ref}*:\nStatus: *{status}*{noteLine}',
  'svc.storageFull': 'Sorry, we cannot accept file uploads right now. Your request will be submitted without the file.',

  'ask.prompt': 'What would you like to know? Ask me anything about {company}.',
  'ask.more': 'Anything else? Ask another question, or type *MENU*.',
  'ask.unknown': "I'm not sure about that. Would you like to:\n1️⃣ Connect to a staff member\n2️⃣ Submit a request\n3️⃣ Ask another question\n4️⃣ Return to menu",
  'ask.again': 'Sure, what would you like to know?',
  'ask.hours': '🕗 Our opening hours:\n{hours}',
  'ask.location': '📍 We are located at: {location}',
  'ask.contact': '📞 You can reach us on {contact}.',

  'ho.askDept': 'Which team would you like to talk to?\n{list}',
  'ho.connected': '👤 You are being connected to *{dept}*.\nReference: *{ref}*\n\nA team member will reply here shortly. Type *MENU* to return to the assistant.',
  'ho.waiting': 'Your message has been passed to our team (reference {ref}). Type *MENU* to return to the assistant.',
  'ho.closedByStaff': 'Our team has closed this conversation. Thank you! Type *MENU* anytime for more help.',
  'ho.resumed': 'You are back with the virtual assistant.',

  'status.none': "You don't have any requests yet. Type *MENU* to get started.",
  'status.header': 'Your latest requests:',
  'status.visitLine': '• {ref} – {kind} with {host}, {date} {time}: *{status}*',
  'status.ticketLine': '• {ref} – {category}: *{status}*',
  'status.feedbackLine': '• {ref} – feedback ({topic})',

  'notify.checkedIn': '✅ Welcome to {company}, {first}! You are checked in. {host} has been told you have arrived.{wifi}',
  'notify.wifi': '\n\n📶 Guest Wi-Fi: {ssid}\nPassword: {password}',
  'notify.reminder': '⏰ Reminder: your {kind} with {host} is today at {time}.\nReference: {ref}\nPlease bring this chat (QR code / PIN) to the gate.',
  'notify.calendarCaption': '📅 Add this {kind} to your calendar.',
};

const TN = {
  'welcome.new':
    'O amogelesegile kwa {company}! 👋\nKe mothusi wa gago wa inthanete. Nka go thusa go kwadisa ketelo, go beela kopano, go neela maikutlo, go kopa tirelo kgotsa go araba dipotso tsa gago.\n\nPele re simolola, a re dire porofaele ya gago.',
  'welcome.back': '👋 O amogelesegile gape, {first}!',
  'profile.askName': 'Tsweetswee kwala maina a gago ka botlalo:',
  'profile.badName': 'Tsweetswee kwala leina le sefane, sekai: Kabelo Molefe.',
  'profile.askType': 'O etela jaaka:\n1️⃣ Mokgatlho / Kompone\n2️⃣ Motho ka esi\n3️⃣ Tse dingwe',
  'profile.askCompany': 'Tsweetswee kwala leina la kompone / mokgatlho wa gago:',
  'profile.askOther': 'Tsweetswee re bolelele gore o emetse mang (sekai: moithuti, motlhankedi wa puso, rakonteraka):',
  'profile.askEmail': 'Tsweetswee kwala aterese ya imeile (ga e patelediwe).\nAraba ka *SKIP* go tswelela kwa ntle ga yone.',
  'profile.badEmail': 'Seo ga se lebege jaaka imeile. Tsweetswee kwala imeile e e siameng, kgotsa araba ka *SKIP*.',
  'profile.done': '✅ Porofaele ya gago e dirilwe! Ke a leboga, {first}.',

  'menu.title': 'Re ka go thusa ka eng gompieno?',
  'menu.register': 'Kwadiso ya Moeti',
  'menu.appointment': 'Beela Kopano',
  'menu.feedback': 'Neela Maikutlo',
  'menu.service': 'Kopa Tirelo',
  'menu.ask': 'Botsa Potso',
  'menu.footer': 'Araba ka nomoro.\nKwala *MENU* nako nngwe le nngwe go boela fano, kgotsa *HELP* go bona ditaelo tsotlhe.',
  'menu.invalid': 'Tsweetswee araba ka nngwe ya dinomoro tse di fa tlase.',

  'help.text':
    'O ka kwala ditaelo tse nako nngwe le nngwe:\n\n*MENU* – lenaane le legolo\n*APPOINTMENT* – bona kgotsa fetola dikopano tsa gago\n*STATUS* – tlhola dikopo tsa gago\n*BACK* – boela morago kgato e le nngwe\n*CANCEL* – emisa se o se dirang\n*HUMAN* kgotsa *AGENT* – bua le modiri\n*SETSWANA* / *ENGLISH* – fetola puo\n*END* – fetsa puisano',
  'cmd.cancelled': 'Go siame, ke se khanseletse.',
  'cmd.nothingToCancel': 'Ga go na sepe se se tswelelang se se ka khanselwang.',
  'cmd.cantGoBack': 'Re kwa tshimologong, ga go na kwa re ka boelang teng.',
  'cmd.lang': 'Puo e fetotswe go Setswana.',
  'end.text': 'Re a leboga go ikgolaganya le {company}! 😊\nO nne le letsatsi le lentle.\n\nKwala *DUMELA* nako nngwe le nngwe go simolola gape.',

  'common.yesNo': '1️⃣ Ee\n2️⃣ Nnyaa',
  'common.pickNumber': 'Tsweetswee araba ka nomoro go tswa mo lenaaneng.',
  'common.confirmOptions': '1️⃣ Tlhomamisa\n2️⃣ Fetola dintlha\n3️⃣ Khansela',
  'common.unavailable': 'Maswabi, tirelo e ga e yo ka nako e. Kwala *MENU* go bona dikgetho.',
  'common.error': 'Maswabi, go na le bothata ka fa go rona. Tsweetswee leka gape morago ga sebakanyana.',

  'reg.askHost': 'O etela mang?\nTsweetswee kwala leina la motho kgotsa lefapha.',
  'reg.hostFound': 'Ke bone *{host}*{deptLine}{officeLine}\n\nA ke ene motho yo o mo etelang?\n1️⃣ Ee\n2️⃣ Nnyaa',
  'reg.hostMany': 'Ke bone batho ba le mmalwa. O etela mang?\n{list}\n\nAraba ka nomoro.',
  'reg.hostNone': 'Ga ke a bona "{query}" mo lenaaneng la rona. Tsweetswee tlhola mopeleto, kgotsa kwala lefapha.',
  'reg.hostDirectory': 'Ga ke ise ke mmone. Leno ke lenaane la rona:\n{list}\n\nAraba ka nomoro, kgotsa kwala leina.',
  'reg.hostNoneAtAll': 'Maswabi, ga go na batho ba ba ka etelwang ka nako e. Tsweetswee ikgolaganye le kamogelo.',
  'reg.hostRetry': 'Go siame. Tsweetswee kwala leina kgotsa lefapha la motho yo o mo etelang.',
  'reg.askPurpose': 'Maikaelelo a ketelo ya gago ke eng?\n{list}',
  'reg.askPurposeOther': 'Tsweetswee tlhalosa maikaelelo a ketelo ya gago:',
  'reg.askDate': 'O tla etela ka letlha lefe?\nSekai: *kamoso*, *Mosupologo* kgotsa *25/10/2026*.',
  'reg.badDate': 'Ga ke a tlhaloganya letlha leo. Tsweetswee romela letlha jaaka *kamoso*, *Labotlhano* kgotsa *25/10/2026*.',
  'reg.pastDate': 'Letlha leo le setse le fetile. Tsweetswee tlhopha gompieno kgotsa letlha le le tlang.',
  'reg.closedDay': 'Re tswetse ka {date}. Tsweetswee tlhopha letsatsi le lengwe.\nDiura tsa rona:\n{hours}',
  'reg.askTime': 'O tla goroga ka nako mang ka {date}?\nDiura tsa kantoro: {open} – {close}.{slots}',
  'reg.slotsLine': '\nDinako tse di leng teng: {slots}',
  'reg.badTime': 'Ga ke a tlhaloganya nako eo. Tsweetswee romela nako jaaka *10:00* kgotsa *2pm*.',
  'reg.closedTime': 'Nako eo e kwa ntle ga diura tsa kantoro ({open} – {close}). Tsweetswee tlhopha nako e nngwe.',
  'reg.pastTime': 'Nako eo e setse e fetile gompieno. Tsweetswee tlhopha nako e e tlang.',
  'reg.slotTaken': '{host} o setse a na le ketelo ka nako eo. Dinako tse di gololesegileng ka {date}: {slots}\nTsweetswee tlhopha e le nngwe.',
  'reg.noSlots': '{host} ga a na nako e e gololesegileng ka {date}. Tsweetswee tlhopha letlha le lengwe.',
  'reg.askId': '🪪 Ka ntlha ya tshireletso, tsweetswee romela setshwantsho se se bonalang sa karata ya Omang kgotsa phasepoto.',
  'reg.needIdFile': 'Tsweetswee romela *setshwantsho* kgotsa *PDF* ya karata ya gago go tswelela, kgotsa kwala *CANCEL*.',
  'reg.idSaved': '✅ Karata e amogetswe.',
  'reg.askNda': '📄 Tsweetswee bala tumalano ya rona ya sephiri ya baeti:\n\n{nda}\n\nAraba ka *I AGREE* go dumela, kgotsa *CANCEL* go emisa.',
  'reg.needAgree': 'Go tswelela o tshwanetse go araba ka *I AGREE*, kgotsa kwala *CANCEL*.',
  'reg.healthIntro': '🩺 Ditlhatlhobo tse dikhutshwane tsa boitekanelo (dipotso di le {count}).',
  'reg.healthQ': '{n}. {question}\n1️⃣ Ee\n2️⃣ Nnyaa',
  'reg.summary':
    'Tsweetswee tlhomamisa ketelo ya gago:\n\n👤 Leina: {name}\n🏢 Kompone: {company}\n🙋 O etela: {host}\n📝 Maikaelelo: {purpose}\n📅 Letlha: {date}\n🕐 Nako: {time}\n\n1️⃣ Tlhomamisa\n2️⃣ Fetola dintlha\n3️⃣ Khansela',
  'reg.sent':
    '✅ Kopo ya gago ya ketelo e rometswe kwa go *{host}* go amogelwa.\nNomoro ya tshupo: *{ref}*\n\nO tla itsisiwe fano fa a sena go araba.',
  'reg.flaggedNote': '\n\nKamogelo e tla sekaseka dikarabo tsa gago tsa boitekanelo pele ga ketelo.',
  'reg.limit': 'Maswabi, ga re kgone go amogela dikopo tse dintšhwa ka nako e. Tsweetswee ikgolaganye le kamogelo.',

  'appt.askWith': 'O batla go kopana le mang?\nTsweetswee kwala motho, lefapha kgotsa tirelo.',
  'appt.askTopic': 'O batla go buisana ka eng?',
  'appt.askType': 'Ke kopano ya mofuta ofe?\n{list}',
  'appt.summary':
    'Tsweetswee tlhomamisa kopano ya gago:\n\n🙋 Le: {host}\n📌 Mofuta: {type}\n💬 Setlhogo: {topic}\n📅 Letlha: {date}\n🕐 Nako: {time}\n\n1️⃣ Tlhomamisa\n2️⃣ Fetola dintlha\n3️⃣ Khansela',
  'appt.sent':
    '📅 Kopo ya gago ya kopano e rometswe kwa go *{host}*.\nNomoro ya tshupo: *{ref}*\n\nFa e sena go tlhomamisiwa o tla amogela netefatso le taletso ya khalendara fano, le kgopotso ura pele.',

  'manage.none': 'Ga o na diketelo kgotsa dikopano tse di tlang.\nKwala *MENU* go beela.',
  'manage.list': 'Dikopano tsa gago tse di tlang:\n{list}\n\nAraba ka nomoro go e laola.',
  'manage.options': '*{ref}* – {kind} le {host}\n{date} ka {time} · {status}\n\n1️⃣ Fetola nako\n2️⃣ Khansela\n3️⃣ Bona dintlha\n4️⃣ Tsenya mo khalendareng\n5️⃣ Boela kwa lenaaneng',
  'manage.details':
    'Nomoro ya tshupo: {ref}\nMofuta: {kind}\nO etela: {host}{deptLine}{officeLine}\nMaikaelelo: {purpose}\nLetlha: {date}\nNako: {time}\nMaemo: {status}{pinLine}',
  'manage.cancelConfirm': 'Khansela {kindLower} *{ref}* ya {date} ka {time}?\n1️⃣ Ee, e khansele\n2️⃣ Nnyaa, e tlogele',
  'manage.cancelled': '❌ {kind} *{ref}* e khanseletswe. {host} o itsisitswe.',
  'manage.kept': 'Go siame, ga go sepe se se fetotsweng.',
  'manage.rescheduled': '🔄 *{ref}* e fetoletswe go {date} ka {time}. {host} o kopilwe go tlhomamisa nako e ntšhwa.',
  'manage.cantChange': 'Kopano e ga e sa kgone go fetolwa (e {status}).',
  'manage.calendarSent': '📅 Taletso ya gago ya khalendara ke e.',
  'kind.visit': 'Ketelo',
  'kind.appointment': 'Kopano',

  'fb.askTopic': 'O batla go neela maikutlo ka ga eng?\n{list}',
  'fb.askComment': 'Tsweetswee re bolelele maikutlo a gago:',
  'fb.askRating': 'O ka lekanyetsa jang tirelo ya rona?\nAraba ka nomoro go tloga go 1 go ya go 5 ⭐\n(1 = e maswe thata, 5 = e ntle thata)',
  'fb.badRating': 'Tsweetswee araba ka nomoro go tloga go 1 go ya go 5.',
  'fb.thanks': '🙏 Re a leboga maikutlo a gago!\nNomoro ya tshupo: *{ref}*',
  'fb.askComplaint': 'Re maswabi go utlwa seo. 😔\nTsweetswee tlhalosa ngongorego ya gago:',
  'fb.askContact': 'A o batla gore modiri a ikgolaganye le wena ka seno?\n1️⃣ Ee\n2️⃣ Nnyaa',
  'fb.complaintSaved': 'Ngongorego ya gago e kwadilwe mme e fetiseditswe kwa setlhopheng sa rona.\nNomoro ya tshupo: *{ref}*{contactLine}',
  'fb.contactLine': '\nModiri o tla ikgolaganya le wena ka bonako.',
  'fb.offerAfterVisit': 'Re a leboga go etela {company}! 👋\nA o ka rata go neela maikutlo ka ketelo ya gago?\n1️⃣ Ee\n2️⃣ Nnyaa',
  'fb.noThanks': 'Go siame. O nne le letsatsi le lentle! Kwala *MENU* nako nngwe le nngwe.',

  'svc.askCategory': 'O tlhoka tirelo ya mofuta ofe?\n{list}',
  'svc.askDescribe': 'Tsweetswee tlhalosa kopo ya gago:',
  'svc.askPriority': 'E potlakile go le kae?\n{list}',
  'svc.askAttach': 'A o batla go tsenya faele kgotsa setshwantsho?\n1️⃣ Ee\n2️⃣ Nnyaa',
  'svc.askFile': 'Tsweetswee romela faele kgotsa setshwantsho jaanong.',
  'svc.needFile': 'Tsweetswee romela setshwantsho kgotsa tokomane, kgotsa araba ka *SKIP* go tswelela kwa ntle ga yone.',
  'svc.fileSaved': '📎 Faele e tsentswe.',
  'svc.summary': 'Tsweetswee tlhomamisa kopo ya gago ya tirelo:\n\n🔧 Mofuta: {category}\n📝 Dintlha: {description}\n⚡ Bopotlakileng: {priority}{fileLine}\n\n1️⃣ Romela\n2️⃣ Fetola dintlha\n3️⃣ Khansela',
  'svc.fileLine': '\n📎 Faele: ee',
  'svc.sent': '✅ Kopo ya gago ya tirelo e rometswe.\nNomoro ya tekete: *{ref}*\n\nRe tla go itsise fano fa maemo a fetoga. Kwala *STATUS* go e tlhola nako nngwe le nngwe.',
  'svc.update': '🔔 Tshedimosetso ka kopo ya gago ya tirelo *{ref}*:\nMaemo: *{status}*{noteLine}',
  'svc.storageFull': 'Maswabi, ga re kgone go amogela difaele ka nako e. Kopo ya gago e tla romelwa kwa ntle ga faele.',

  'ask.prompt': 'O batla go itse eng? Mpotse sengwe le sengwe ka ga {company}.',
  'ask.more': 'A go na le sengwe gape? Botsa potso e nngwe, kgotsa kwala *MENU*.',
  'ask.unknown': 'Ga ke itse sentle ka ga seo. A o ka rata go:\n1️⃣ Bua le modiri\n2️⃣ Romela kopo\n3️⃣ Botsa potso e nngwe\n4️⃣ Boela kwa lenaaneng',
  'ask.again': 'Go siame, o batla go itse eng?',
  'ask.hours': '🕗 Diura tsa rona tsa go bula:\n{hours}',
  'ask.location': '📍 Re fitlhelwa kwa: {location}',
  'ask.contact': '📞 O ka ikgolaganya le rona ka {contact}.',

  'ho.askDept': 'O batla go bua le setlhopha sefe?\n{list}',
  'ho.connected': '👤 O golaganngwa le *{dept}*.\nNomoro ya tshupo: *{ref}*\n\nModiri o tla araba fano ka bonako. Kwala *MENU* go boela kwa mothusing.',
  'ho.waiting': 'Molaetsa wa gago o fetiseditswe kwa setlhopheng sa rona (nomoro {ref}). Kwala *MENU* go boela kwa mothusing.',
  'ho.closedByStaff': 'Setlhopha sa rona se tswetse puisano e. Re a leboga! Kwala *MENU* nako nngwe le nngwe.',
  'ho.resumed': 'O boetse kwa mothusing wa inthanete.',

  'status.none': 'Ga o ise o nne le dikopo. Kwala *MENU* go simolola.',
  'status.header': 'Dikopo tsa gago tsa bosheng:',
  'status.visitLine': '• {ref} – {kind} le {host}, {date} {time}: *{status}*',
  'status.ticketLine': '• {ref} – {category}: *{status}*',
  'status.feedbackLine': '• {ref} – maikutlo ({topic})',

  'notify.checkedIn': '✅ O amogelesegile kwa {company}, {first}! O tsene. {host} o itsisitswe gore o gorogile.{wifi}',
  'notify.wifi': '\n\n📶 Wi-Fi ya baeti: {ssid}\nPassword: {password}',
  'notify.reminder': '⏰ Kgopotso: {kind} ya gago le {host} ke gompieno ka {time}.\nNomoro ya tshupo: {ref}\nTlisa puisano e (QR code / PIN) kwa kgorong.',
  'notify.calendarCaption': '📅 Tsenya {kind} e mo khalendareng ya gago.',
};

export const OPTIONS = {
  profileType: [
    { key: 'organisation', en: 'Organisation', tn: 'Mokgatlho' },
    { key: 'individual', en: 'Individual', tn: 'Motho ka esi' },
    { key: 'other', en: 'Other', tn: 'Tse dingwe' },
  ],
  purpose: [
    { key: 'meeting', en: 'Meeting', tn: 'Kopano' },
    { key: 'business', en: 'Business', tn: 'Kgwebo' },
    { key: 'interview', en: 'Interview', tn: 'Potsolotso ya tiro' },
    { key: 'delivery', en: 'Delivery', tn: 'Go tlisa dithoto' },
    { key: 'service', en: 'Service / Support', tn: 'Tirelo / Thuso' },
    { key: 'other', en: 'Other', tn: 'Tse dingwe' },
  ],
  appointmentType: [
    { key: 'consultation', en: 'Consultation', tn: 'Kgakololo' },
    { key: 'business_meeting', en: 'Business Meeting', tn: 'Kopano ya kgwebo' },
    { key: 'service_support', en: 'Service / Support', tn: 'Tirelo / Thuso' },
    { key: 'sales', en: 'Sales', tn: 'Thekiso' },
    { key: 'other', en: 'Other', tn: 'Tse dingwe' },
  ],
  feedbackTopic: [
    { key: 'visit', en: 'Visit Experience', tn: 'Maitemogelo a ketelo' },
    { key: 'appointment', en: 'Appointment', tn: 'Kopano' },
    { key: 'service', en: 'Service', tn: 'Tirelo' },
    { key: 'staff', en: 'Staff', tn: 'Badiri' },
    { key: 'general', en: 'General Feedback', tn: 'Maikutlo a kakaretso' },
    { key: 'complaint', en: 'Complaint', tn: 'Ngongorego' },
  ],
  serviceCategory: [
    { key: 'it_support', en: 'IT Support', tn: 'Thuso ya IT' },
    { key: 'technical', en: 'Technical Assistance', tn: 'Thuso ya setegeniki' },
    { key: 'account_billing', en: 'Account / Billing', tn: 'Akhaonto / Dituelo' },
    { key: 'document', en: 'Document Request', tn: 'Kopo ya tokomane' },
    { key: 'maintenance', en: 'Maintenance', tn: 'Tlhokomelo' },
    { key: 'other', en: 'Other', tn: 'Tse dingwe' },
  ],
  priority: [
    { key: 'low', en: 'Low', tn: 'Kwa tlase' },
    { key: 'normal', en: 'Normal', tn: 'Tlwaelegile' },
    { key: 'high', en: 'High', tn: 'Kwa godimo' },
    { key: 'critical', en: 'Critical', tn: 'E potlakile thata' },
  ],
};

export const SERVICE_STATUS = {
  open: { en: 'Open', tn: 'E butswe' },
  in_progress: { en: 'In progress', tn: 'E a dirwa' },
  resolved: { en: 'Resolved', tn: 'E rarabolotswe' },
  closed: { en: 'Closed', tn: 'E tswetswe' },
};

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export function numberEmoji(i) {
  return EMOJI_NUMBERS[i] || `${i + 1}.`;
}

export function ft(lang, key, vars = {}) {
  const table = normalizeLang(lang) === 'tn' ? TN : EN;
  const template = table[key] ?? EN[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])));
}

export function optionLabel(group, key, lang) {
  const item = OPTIONS[group].find((o) => o.key === key);
  if (!item) return key || '';
  return normalizeLang(lang) === 'tn' ? item.tn : item.en;
}

export function optionList(group, lang) {
  return OPTIONS[group].map((o, i) => `${numberEmoji(i)} ${normalizeLang(lang) === 'tn' ? o.tn : o.en}`).join('\n');
}

export function numberedList(lines) {
  return lines.map((line, i) => `${numberEmoji(i)} ${line}`).join('\n');
}
