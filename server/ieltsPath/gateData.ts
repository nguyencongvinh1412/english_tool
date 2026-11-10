/**
 * Gate 1-6 content from the gate test book (docs: "Bo test chuyen level IELTS Gate 0 den Gate 6"): the short
 * listening and reading tests of Gates 1-4 (version A), the writing and speaking tasks of Gates 1-6 (versions A and B).
 * Listening and reading of the retake (version B) and of Gates 5-6 come from the generated pool (see gates.ts).
 */
import type { GateGroup } from './gateContent.js';

const gap = (prompt: string, answers: string[], explanation: string, wordLimit = 1) => ({ type: 'gap' as const, prompt, answers, wordLimit, explanation });
const pick = (prompt: string, options: string[], answerIndex: number, explanation: string) => ({ type: 'match' as const, prompt, options, answerIndex, explanation });
const tfng = (prompt: string, answer: 'true' | 'false' | 'not_given', explanation: string) => ({ type: 'tfng' as const, prompt, answer, explanation });
const YNNG = ['Yes', 'No', 'Not Given'];

const speakers2 = (a: [string, 'female' | 'male'], b: [string, 'female' | 'male']) => ({ A: { name: a[0], gender: a[1] }, B: { name: b[0], gender: b[1] } });
const lines = (speaker: 'A' | 'B', ...texts: string[]) => texts.map((text) => ({ speaker, text }));

export const GATE_LR_GROUPS: GateGroup[] = [
  /* ---------- Gate 1: form completion (4.5) ---------- */
  {
    id: 'gate-1-listening',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'A2',
    payload: {
      section: 1,
      title: 'Joining a gym',
      context: 'You will hear a man joining a gym. Complete the membership form. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.',
      speakers: speakers2(['Receptionist', 'female'], ['Daniel', 'male']),
      script: [
        ...lines('A', 'Good morning, Fit Zone Gym. How can I help?'),
        ...lines('B', "Hi, I'd like to join the gym."),
        ...lines('A', 'Sure. Can I take your name?'),
        ...lines('B', 'Daniel Harris.'),
        ...lines('A', 'Could you spell your surname?'),
        ...lines('B', 'H, A, R, R, I, S.'),
        ...lines('A', 'Thanks. And a contact number?'),
        ...lines('B', "It's 07 5550 1832."),
        ...lines('A', '07 5550 1832. Are you a student, or would you like standard membership?'),
        ...lines('B', "I'm a student at the university."),
        ...lines('A', "Then student membership is best. It's thirty-five dollars a month. Standard is fifty."),
        ...lines('B', 'Great. When can I start?'),
        ...lines('A', 'Any time. We have a place from the fourteenth of March.'),
        ...lines('B', 'The fourteenth is perfect.'),
        ...lines('A', 'Which time do you usually prefer: mornings, afternoons or evenings?'),
        ...lines('B', 'Evenings, after my classes.'),
        ...lines('A', 'Okay. What address should I write for the bill?'),
        ...lines('B', 'Twelve Maple Street.'),
        ...lines('A', 'Twelve Maple Street. And why do you want to join?'),
        ...lines('B', "I'd like to lose weight, and I want more energy for studying."),
        ...lines('A', "Good reasons. We also offer a free fitness test for new members. It's on Tuesday afternoons."),
        ...lines('B', 'Tuesday works for me.'),
        ...lines('A', 'Please bring trainers and a towel.'),
        ...lines('B', 'Will do. Thanks.'),
      ],
      questions: [
        gap('Surname: ____', ['Harris'], 'He spells it: H-A-R-R-I-S.'),
        gap('Phone number: ____', ['07 5550 1832'], 'He says "It\'s 07 5550 1832".', 3),
        gap('Type of membership: ____', ['student'], 'He is a student, so student membership is best.'),
        gap('Monthly cost: $ ____', ['35', 'thirty-five'], 'Student membership is thirty-five dollars a month. Standard is fifty.'),
        gap('Start date: ____ March', ['14', 'fourteenth'], 'A place is free from the fourteenth of March.'),
        gap('Preferred time to visit: ____', ['evenings'], 'He prefers evenings, after his classes.'),
        gap('Address: 12 ____ Street', ['Maple'], 'Twelve Maple Street.'),
        gap('Reason for joining: to ____', ['lose weight'], 'He would like to lose weight.', 2),
        gap('Free fitness test on: ____ afternoons', ['Tuesday'], 'The free fitness test is on Tuesday afternoons.'),
        gap('Please bring: ____ and a towel', ['trainers'], 'Please bring trainers and a towel.'),
      ],
    },
  },
  {
    id: 'gate-1-reading',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'A2',
    payload: {
      title: 'The bicycle library',
      paragraphs: [
        'The town of Millbrook started a "bicycle library" in 2019. Residents can borrow a bicycle for free for up to two weeks. The idea came from a local teacher, Anna Moore, who noticed that many students walked more than three kilometres to school because their families could not afford bicycles. The town council gave the project a small building near the railway station, and the first twenty bicycles were donated by local shops. Today the library has more than ninety bicycles, including some for children. To borrow one, a person must show proof of address and sign a form. Volunteers repair the bicycles every Saturday morning, and anyone can join them to learn basic repair skills. A recent survey shows that the number of people cycling to work in Millbrook has risen from 8 per cent to 15 per cent. However, about ten bicycles are not returned each year. The council plans to open a second library near the university, but it has not yet chosen a date.',
      ],
      questions: [
        tfng('The bicycle library opened in 2019.', 'true', 'The text says it started in 2019.'),
        tfng('Anna Moore is a member of the town council.', 'false', 'She is a local teacher; the council only gave the building.'),
        tfng('The first bicycles were bought by the council.', 'false', 'They were donated by local shops.'),
        tfng('Borrowers have to pay a small fee.', 'false', 'Bicycles can be borrowed for free.'),
        tfng('Bicycles for children are available.', 'true', 'The library has some bicycles for children.'),
        tfng('The library is open every day of the week.', 'not_given', 'The opening days are not mentioned.'),
        gap('Volunteers repair the bicycles on ____ mornings.', ['Saturday'], 'Volunteers repair the bicycles every Saturday morning.'),
        gap('Borrowers must show proof of ____.', ['address'], 'A person must show proof of address and sign a form.'),
        gap('The percentage of people cycling to work has risen from 8 to ____ per cent.', ['15'], 'It rose from 8 per cent to 15 per cent.'),
        gap('The council plans a second library near the ____.', ['university'], 'The second library is planned near the university.'),
      ],
    },
  },

  /* ---------- Gate 2: a library tour (5.0) ---------- */
  {
    id: 'gate-2-listening',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'A2',
    payload: {
      section: 2,
      title: 'A tour of the university library',
      context: 'You will hear a guide giving a tour of a university library. Questions 1-5: choose the correct letter. Questions 6-10: choose the floor for each area.',
      speakers: { A: { name: 'Guide', gender: 'female' } },
      script: lines(
        'A',
        "Welcome to the City University Library. I'm going to give you a short tour, so please stay together.",
        'First, opening hours. On weekdays the library is open from eight in the morning until ten at night.',
        'At weekends it closes earlier, at six. During the exam period it stays open until midnight, but that does not apply this month.',
        'Now, borrowing. When you come in, the help desk is on your left. Students can borrow up to eight books at a time, and each book can be kept for three weeks.',
        'If you need it for longer, you can renew it online, but only once.',
        'Next, study spaces. The quiet study rooms are on the second floor. They must be booked online, and you can book a room for a maximum of two hours.',
        'In the reading rooms, please do not eat food. You may bring drinks, but only if they have a lid.',
        "Finally, let me tell you where to find things. Science and engineering books are on the third floor. History books are on the first floor.",
        'The languages section is on the second floor, next to the quiet study rooms. The computer area is on the ground floor, near the entrance, and the cafe is on the first floor.',
        'Please collect your student card from the help desk before you leave. Thank you.'
      ),
      questions: [
        pick('On weekdays the library closes at:', ['6 pm', '10 pm', 'midnight'], 1, 'Weekdays: open from eight until ten at night. Midnight is only in the exam period.'),
        pick('Students can borrow up to:', ['3 books', '8 books', '12 books'], 1, 'Students can borrow up to eight books at a time.'),
        pick('The normal loan period is:', ['one week', 'two weeks', 'three weeks'], 2, 'Each book can be kept for three weeks.'),
        pick('A quiet study room can be booked for a maximum of:', ['one hour', 'two hours', 'three hours'], 1, 'You can book a room for a maximum of two hours.'),
        pick('In the reading rooms students may bring:', ['hot food', 'drinks with a lid', 'nothing at all'], 1, 'No food, but drinks with a lid are allowed.'),
        pick('Science books', ['Ground floor', 'First floor', 'Second floor', 'Third floor'], 3, 'Science and engineering books are on the third floor.'),
        pick('History books', ['Ground floor', 'First floor', 'Second floor', 'Third floor'], 1, 'History books are on the first floor.'),
        pick('Languages', ['Ground floor', 'First floor', 'Second floor', 'Third floor'], 2, 'The languages section is on the second floor.'),
        pick('Computer area', ['Ground floor', 'First floor', 'Second floor', 'Third floor'], 0, 'The computer area is on the ground floor, near the entrance.'),
        pick('Cafe', ['Ground floor', 'First floor', 'Second floor', 'Third floor'], 1, 'The cafe is on the first floor.'),
      ],
    },
  },
  {
    id: 'gate-2-reading',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'A2',
    payload: {
      title: 'Teenagers and sleep',
      paragraphs: [
        'Many teenagers do not get enough sleep. Experts recommend eight to ten hours a night for people aged 14 to 17, but surveys suggest that most teenagers sleep only six or seven hours on school days.',
        'One reason is biological. During adolescence the body clock shifts, so teenagers naturally feel sleepy later at night and wake up later in the morning. Early school start times therefore force many students to get up when their bodies still want to sleep.',
        'Technology also plays a role. The blue light from phone and computer screens can delay the release of melatonin, a chemical that helps people fall asleep. Many teenagers use their phones in bed, which makes the problem worse.',
        'Lack of sleep affects learning. In one study, schools that started an hour later saw a rise in test scores and fewer students arriving late. Researchers also found fewer car accidents among teenage drivers. Not all schools can change their timetable, but experts suggest simple steps such as switching off screens an hour before bed.',
      ],
      questions: [
        ...(['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D'] as const).map((p, i) =>
          pick(p, ['Effects of later school starts', 'A natural change in the body', 'A growing sleep problem', 'The danger of caffeine', 'How screens interfere with sleep', 'Advice for parents about homework'], [2, 1, 4, 0][i], 'Choose the heading that covers the whole paragraph.')
        ),
        tfng('Experts say teenagers should sleep eight to ten hours a night.', 'true', 'Experts recommend eight to ten hours.'),
        tfng('Most teenagers sleep nine hours on school days.', 'false', 'Most sleep only six or seven hours.'),
        tfng("Teenagers' body clocks make them feel sleepy later at night.", 'true', 'The body clock shifts, so they feel sleepy later.'),
        tfng('Melatonin is released by blue light.', 'false', 'Blue light can delay the release of melatonin.'),
        tfng('All schools can easily change their start times.', 'false', 'Not all schools can change their timetable.'),
        tfng('Teenagers who drink coffee sleep less than others.', 'not_given', 'Coffee is not mentioned.'),
      ],
    },
  },

  /* ---------- Gate 3: planning a presentation (5.5) ---------- */
  {
    id: 'gate-3-listening',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'B1',
    payload: {
      section: 3,
      title: 'Planning a presentation',
      context: 'You will hear two students, Tom and Mia, discussing a presentation. Questions 1-5: choose the correct letter. Questions 6-10: complete the notes with NO MORE THAN TWO WORDS AND/OR A NUMBER.',
      speakers: speakers2(['Tom', 'male'], ['Mia', 'female']),
      script: [
        { speaker: 'A', text: 'Hi Mia. Have you decided what to focus on for the presentation?' },
        { speaker: 'B', text: 'I was thinking about solar power, but the tutor said too many groups choose it.' },
        { speaker: 'A', text: 'True. What about tidal energy?' },
        { speaker: 'B', text: 'I like it, but last year a group chose it and struggled to find statistics.' },
        { speaker: 'A', text: 'Hmm. Then how about wind power, but only offshore wind?' },
        { speaker: 'B', text: "Yes, that's a good compromise. Let's go with offshore wind." },
        { speaker: 'A', text: 'Great. How long does the presentation have to be?' },
        { speaker: 'B', text: 'Fifteen minutes, and then five more for questions.' },
        { speaker: 'A', text: 'And the deadline? I thought it was the twelfth of May.' },
        { speaker: 'B', text: "No, they moved it. It's now the nineteenth of May." },
        { speaker: 'A', text: 'Okay. Who will do what?' },
        { speaker: 'B', text: "You're better at design, so you do the slides, and I'll do the research." },
        { speaker: 'A', text: 'Fine. And when can we practise?' },
        { speaker: 'B', text: "The study rooms are free on Thursday afternoon, so let's rehearse then, not on Tuesday or Wednesday." },
        { speaker: 'A', text: 'Good. Did the tutor give us any advice?' },
        { speaker: 'B', text: 'Yes. Firstly, no more than six lines of text on each slide. Secondly, include one graph showing the costs. Thirdly, look at the audience, not the screen, when we speak.' },
        { speaker: 'A', text: 'Anything about the report?' },
        { speaker: 'B', text: 'It should be five hundred words, and we hand it in to the department office.' },
        { speaker: 'A', text: 'Okay, thanks, Mia.' },
      ],
      questions: [
        pick('The students finally choose:', ['solar power', 'tidal energy', 'offshore wind power'], 2, 'They agree on offshore wind.'),
        pick('The presentation lasts:', ['10 minutes', '15 minutes', '20 minutes'], 1, 'Fifteen minutes, then five for questions.'),
        pick('The deadline is:', ['12 May', '19 May', '29 May'], 1, 'The twelfth was moved to the nineteenth of May.'),
        pick('Tom will be responsible for:', ['the research', 'the slides', 'the introduction'], 1, 'Tom does the slides; Mia does the research.'),
        pick('They will rehearse on:', ['Tuesday', 'Wednesday', 'Thursday'], 2, 'The rooms are free on Thursday afternoon.'),
        gap('Each slide should have no more than ____ lines of text.', ['six', '6'], 'No more than six lines of text on each slide.'),
        gap('Include one graph about ____.', ['costs'], 'One graph showing the costs.'),
        gap('Look at the ____, not the screen.', ['audience'], 'Look at the audience, not the screen.'),
        gap('The written report should be ____ words.', ['500', 'five hundred'], 'It should be five hundred words.', 2),
        gap('Hand the report in to the ____ office.', ['department'], 'They hand it in to the department office.'),
      ],
    },
  },
  {
    id: 'gate-3-reading',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'B1',
    payload: {
      title: 'The rise of remote work',
      paragraphs: [
        'Working from home was once rare, but the pandemic of 2020 made it common almost overnight. Surveys carried out afterwards found that around forty per cent of office workers in many countries now work remotely at least two days a week. Supporters of remote work point to several advantages. Employees save time and money by not commuting, and many report that they can concentrate better at home. Companies can also reduce costs by renting smaller offices.',
        'However, the picture is not entirely positive. Some managers worry that it is harder to train new staff when they never meet colleagues face to face. Junior employees, in particular, may miss out on the casual conversations through which experience is shared. There is also evidence that remote workers find it difficult to separate work from private life, often answering emails late into the evening.',
        'In my view, the most sensible solution is a hybrid model, in which employees spend part of the week at the office and part at home. This approach keeps the social benefits of the workplace while giving people flexibility. It would be a mistake, however, to assume that one arrangement suits everyone. Some jobs, such as laboratory research or customer service in shops, simply cannot be done remotely, and some individuals are happier surrounded by other people.',
        'City governments have also begun to feel the effects. Central business districts, once crowded at lunchtime, have seen a fall in sales for cafes and sandwich shops, while shops in residential neighbourhoods are busier. Planners now disagree about whether city centres will recover or must find new purposes, such as housing.',
      ],
      questions: [
        pick('The writer believes remote work became common because of the pandemic.', YNNG, 0, 'The pandemic made it common almost overnight.'),
        pick('The writer says remote workers are more productive than office workers.', YNNG, 2, 'Some report better concentration, but productivity is not compared.'),
        pick('The writer is convinced that a hybrid model is the best option.', YNNG, 0, '"In my view, the most sensible solution is a hybrid model."'),
        pick('The writer believes remote work suits every kind of job.', YNNG, 1, 'Some jobs cannot be done remotely.'),
        pick('The writer thinks city centres will soon become mainly residential.', YNNG, 2, 'Planners disagree; the writer gives no view.'),
        gap('About forty per cent of office workers work remotely at least ____ days a week.', ['two', '2'], 'At least two days a week.'),
        gap('Employees save time and money by not ____.', ['commuting'], 'They save time and money by not commuting.'),
        gap('Junior employees may miss the casual ____ through which experience is shared.', ['conversations'], 'They may miss out on the casual conversations.'),
        gap('Remote workers often answer ____ late into the evening.', ['emails'], 'They often answer emails late into the evening.'),
        gap('Jobs such as laboratory research cannot be done ____.', ['remotely'], 'They simply cannot be done remotely.'),
      ],
    },
  },

  /* ---------- Gate 4: a lecture on green roofs (6.0) ---------- */
  {
    id: 'gate-4-listening',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'B1',
    payload: {
      section: 4,
      title: 'Green roofs',
      context: 'You will hear a lecture about green roofs. Complete the notes. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.',
      speakers: { A: { name: 'Lecturer', gender: 'female' } },
      script: lines(
        'A',
        "Good morning. Today I'd like to talk about green roofs, that is, roofs covered with plants.",
        'The idea is not new. In Scandinavia, people used grass roofs for centuries to keep their houses warm.',
        'Modern green roofs became popular in Germany in the 1960s, and the technology has spread since then.',
        'What are the benefits? First, temperature. In summer, a green roof can lower the temperature inside a building by up to five degrees, which means less air conditioning.',
        'Second, rainwater. Plants absorb rain, so there is less risk of flooding after heavy storms.',
        'Third, wildlife. Green roofs provide habitats for insects, especially bees.',
        'There are also drawbacks. The main one is cost: installing a green roof is about twice as expensive as installing an ordinary one.',
        "In addition, wet soil is heavy, so engineers must check the building's structure before work begins. Finally, roofs need to be watered in dry weather.",
        'Lastly, two types. Extensive roofs have a thin layer of soil, about ten centimetres, and are planted with moss or small plants.',
        'Intensive roofs have much deeper soil and can support small trees.'
      ),
      questions: [
        gap('In Scandinavia people used ____ roofs to keep houses warm.', ['grass'], 'People used grass roofs for centuries.'),
        gap('Green roofs became popular in ____ in the 1960s.', ['Germany'], 'Modern green roofs became popular in Germany.'),
        gap('In summer a green roof can lower indoor temperature by up to ____ degrees.', ['5', 'five'], 'Up to five degrees.'),
        gap('Plants absorb rain, so there is less risk of ____.', ['flooding'], 'Less risk of flooding after heavy storms.'),
        gap('Roofs provide habitats for ____, especially bees.', ['insects'], 'Habitats for insects, especially bees.'),
        gap('Installation costs about ____ as much as an ordinary roof.', ['twice'], 'About twice as expensive.'),
        gap('Engineers must check the building ____ because wet soil is heavy.', ['structure'], "They must check the building's structure."),
        gap('Roofs need to be ____ in dry weather.', ['watered'], 'Roofs need to be watered in dry weather.'),
        gap('Extensive roofs have a soil layer of about ____ cm.', ['10', 'ten'], 'About ten centimetres.'),
        gap('Intensive roofs can support small ____.', ['trees'], 'Much deeper soil can support small trees.'),
      ],
    },
  },
  {
    id: 'gate-4-reading',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'B1',
    payload: {
      title: 'Why cities are planting trees',
      paragraphs: [
        'Trees in cities do far more than make streets look attractive. Researchers in several countries have found that a mature tree can cool the surrounding air by two to eight degrees through shade and evaporation, which is why neighbourhoods with many trees can be markedly cooler than treeless ones during heatwaves.',
        'The benefits extend to air quality. Leaves trap dust and absorb gases such as nitrogen dioxide, produced mostly by traffic. One study estimated that trees in a large European city remove several hundred tonnes of pollutants each year. Yet scientists caution that trees alone cannot solve pollution; reducing traffic remains far more effective.',
        "There is growing evidence that trees affect people's health in less obvious ways. Hospital patients whose windows overlook trees have been reported to recover faster, and residents of green neighbourhoods tend to show lower levels of stress. The reasons are not fully understood, although some psychologists suggest that natural scenery restores attention after periods of intense concentration.",
        'Despite these advantages, planting trees in cities is not simple. Roots can damage pipes and pavements, and young trees need regular watering for several years. Many planting schemes fail because the trees die within a decade, usually through neglect rather than disease. For this reason, some councils now ask local residents to adopt trees and care for them.',
        'Cost is another obstacle. Planting and maintaining a tree can cost far more than its immediate economic return, and benefits such as cooler air are difficult to express in money. Economists have therefore tried to calculate a monetary value for the services trees provide, hoping to persuade governments that the investment is worthwhile. Critics argue that such figures are uncertain, but they have already influenced budgets in a number of cities.',
      ],
      questions: [
        ...(
          [
            ['a suggestion about why nature may improve wellbeing', 2],
            ['a warning that another measure is more effective than planting trees', 1],
            ['a reason why many tree-planting projects fail', 3],
            ['a reference to attempts to put a price on benefits', 4],
          ] as const
        ).map(([prompt, index]) => pick(prompt, ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D', 'Paragraph E'], index, 'Find the paragraph that contains this information.')),
        gap('Trees reduce temperature through ____ and evaporation.', ['shade'], 'Shade and evaporation cool the air.'),
        gap('Trees trap dust and absorb ____ such as nitrogen dioxide.', ['gases'], 'They absorb gases such as nitrogen dioxide.'),
        gap('Young trees need regular ____ for several years.', ['watering'], 'They need regular watering for several years.'),
        gap('Many trees die through ____ rather than disease.', ['neglect'], 'Usually through neglect rather than disease.'),
        pick("What is the writer's attitude to the idea that trees can solve air pollution?", ['It is completely false.', 'It is partly true but limited.', 'It has been proved by one study.'], 1, 'Trees help, but reducing traffic is far more effective.'),
        pick('Why have economists tried to calculate the value of trees?', ['To reduce planting costs.', 'To show that trees are harmful.', 'To persuade governments to invest.'], 2, 'They hope to persuade governments that the investment is worthwhile.'),
      ],
    },
  },
];

/* ---------- Writing and speaking, Gates 1-6 ---------- */

type Version = 'A' | 'B';
const task1 = (gate: number, version: Version, title: string, prompt: string, minWords: number, chart: { type: 'bar' | 'line'; unit: string; categories: string[]; series: { name: string; values: number[] }[] }): GateGroup => ({
  id: `gate-${gate}-${version}-writing-1`,
  kind: 'writing-prompt',
  skill: 'writing',
  level: gate <= 2 ? 'A2' : 'B1',
  payload: { taskType: 'ielts-task1', title, instructions: `You should spend about 20 minutes on this task. Write at least ${minWords} words.`, prompt: `${prompt} Summarise the information by selecting and reporting the main features, and make comparisons where relevant.`, minWords, timeMinutes: 20, chart: { ...chart, title } },
});
const task2 = (gate: number, version: Version, title: string, prompt: string, minWords: number, minutes: number): GateGroup => ({
  id: `gate-${gate}-${version}-writing-2`,
  kind: 'writing-prompt',
  skill: 'writing',
  level: gate <= 2 ? 'A2' : 'B1',
  payload: { taskType: 'ielts-task2', title, instructions: `You should spend about ${minutes} minutes on this task. Write at least ${minWords} words.`, prompt, minWords, timeMinutes: minutes },
});
const talk = (gate: number, version: Version, topic: string, part1: string[], cueCard: string, bullets: string[], closing: string, part3: string[]): GateGroup => ({
  id: `gate-${gate}-${version}-speaking`,
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: gate <= 2 ? 'A2' : 'B1',
  payload: { topic, part1, part2: { cueCard, bullets, closing }, part3 },
});

export const GATE_WS_GROUPS: GateGroup[] = [
  // Gate 1
  task1(1, 'A', 'Hours of exercise per week', 'The chart below shows the hours of exercise per week of three age groups in 2019 and 2024.', 120, { type: 'bar', unit: 'hours per week', categories: ['Age 18-25', 'Age 26-40', 'Age 41-60'], series: [{ name: '2019', values: [5, 3, 2] }, { name: '2024', values: [3, 4, 4] }] }),
  task2(1, 'A', 'Working from home', 'Many people now work from home. Is this a good or bad thing? Give reasons for your answer.', 150, 30),
  talk(1, 'A', 'Home and a meal', ['Do you live in a house or an apartment?', 'What do you like about your home?', 'Is it easy to travel from your home to the city centre?'], 'Describe a meal you enjoyed recently.', ['where you had it', 'who you had it with', 'what you ate'], 'and explain why you enjoyed it.', []),
  task1(1, 'B', 'Hours of homework per week', 'The chart below shows the average hours of homework per week of students in three school years in 2010 and 2020.', 120, { type: 'bar', unit: 'hours per week', categories: ['Year 7', 'Year 9', 'Year 11'], series: [{ name: '2010', values: [4, 7, 10] }, { name: '2020', values: [5, 6, 13] }] }),
  task2(1, 'B', 'English at school', 'Some people say that learning English is more important than learning other subjects at school. Do you agree or disagree?', 150, 30),
  talk(1, 'B', 'Friends', ['Where do you live?', 'Do you work or study?', 'What do you do in your free time?'], 'Describe a friend.', ['who this person is', 'how you met', 'what you do together'], 'and explain why this person is important to you.', []),
  // Gate 2
  task1(2, 'A', 'Monthly spending in two countries', 'The chart below shows the average monthly spending of a household in Country A and Country B.', 150, { type: 'bar', unit: 'US dollars', categories: ['Food', 'Transport', 'Housing'], series: [{ name: 'Country A', values: [320, 150, 600] }, { name: 'Country B', values: [410, 90, 480] }] }),
  task2(2, 'A', 'City or small town', 'Some people prefer to live in a big city, while others prefer a small town. Discuss both views and give your own opinion.', 200, 40),
  talk(2, 'A', 'Travel', ['How do you usually travel to work or school?', 'Do you prefer travelling alone or with other people?', 'What would improve public transport in your city?'], 'Describe a place you visited on holiday.', ['where it was', 'when you went', 'what you did there'], 'and explain why you remember it.', ['Why do people like travelling?', 'Is travelling abroad better than travelling in your own country?']),
  task1(2, 'B', 'Visitors to three places', 'The chart below shows the number of visitors to three places in a city in 2005 and 2015.', 150, { type: 'bar', unit: 'thousand visitors', categories: ['Museum', 'Park', 'Zoo'], series: [{ name: '2005', values: [40, 90, 60] }, { name: '2015', values: [75, 80, 95] }] }),
  task2(2, 'B', 'Free public transport', 'Some people think public transport should be free. Is this a good idea? Give your opinion with reasons.', 200, 40),
  talk(2, 'B', 'A journey', ['What is the weather like in your hometown?', 'Which season do you like best?', 'Does the weather affect your mood?'], 'Describe a trip you have taken.', ['where you went', 'who you went with', 'what you did'], 'and explain how you felt about it.', ['Why do people like travelling?', 'Is travelling abroad better than travelling in your own country?']),
  // Gate 3
  task1(3, 'A', 'Households with internet', 'The chart below shows the percentage of households with internet in urban and rural areas in 2005, 2010, 2015 and 2020.', 150, { type: 'line', unit: 'per cent of households', categories: ['2005', '2010', '2015', '2020'], series: [{ name: 'Urban', values: [48, 70, 88, 97] }, { name: 'Rural', values: [22, 45, 68, 85] }] }),
  task2(3, 'A', 'Young people and social media', 'Young people spend too much time on social media. What problems does this cause, and what can be done about it?', 230, 40),
  talk(3, 'A', 'Technology', ['How often do you use your phone?', 'What do you use it for?', 'Do you think people spend too much time on their phones?'], 'Describe a useful piece of technology you own.', ['what it is', 'how you got it', 'how you use it'], 'and explain why it is useful.', ['How has technology changed the way people communicate?', 'Do older people find technology harder to use? Why?']),
  task1(3, 'B', 'Mobile phone owners', 'The chart below shows the percentage of people who owned a mobile phone in two groups in 2005, 2010, 2015 and 2020.', 150, { type: 'line', unit: 'per cent of people', categories: ['2005', '2010', '2015', '2020'], series: [{ name: 'Age 15-30', values: [60, 82, 94, 98] }, { name: 'Age 60+', values: [10, 25, 52, 78] }] }),
  task2(3, 'B', 'Shopping online', 'Many people prefer to buy goods online rather than in shops. What are the advantages and disadvantages?', 230, 40),
  talk(3, 'B', 'Websites', ['Do you use the internet every day?', 'What websites do you visit most?', 'Do you think the internet is safe for children?'], 'Describe a website you often use.', ['what it is', 'how you found it', 'what you use it for'], 'and explain why you like it.', ['How has technology changed the way people communicate?', 'Do older people find technology harder to use? Why?']),
  // Gate 4
  task1(4, 'A', 'Trips by transport', 'The chart below shows the number of trips per year (in millions) by type of transport in a city in 2000 and 2020.', 160, { type: 'bar', unit: 'million trips', categories: ['Bus', 'Metro', 'Tram', 'Bicycle'], series: [{ name: '2000', values: [120, 60, 25, 10] }, { name: '2020', values: [95, 110, 40, 35] }] }),
  task2(4, 'A', 'University fees', 'Some people think university education should be free for everyone. Others think students should pay for it. Discuss both views and give your opinion.', 250, 40),
  talk(4, 'A', 'Study and helping', ['What do you study, or what is your job?', 'Why did you choose it?', 'Would you like to change it in the future?'], 'Describe a time when you helped someone.', ['who you helped', 'what the problem was', 'how you helped'], 'and explain how you felt afterwards.', ['Why do some people find it hard to ask for help?', 'Should schools teach students to help others?', 'Do people help each other less than in the past?']),
  task1(4, 'B', 'Ways of getting news', 'The chart below shows how three age groups got their news in 2010 and 2020 (per cent of people).', 160, { type: 'bar', unit: 'per cent of people', categories: ['Television', 'Newspapers', 'Internet', 'Radio'], series: [{ name: '2010', values: [60, 20, 12, 8] }, { name: '2020', values: [35, 7, 50, 8] }] }),
  task2(4, 'B', 'Learning a foreign language', 'Some people think children should learn a foreign language from a very young age. Others think it is better to start later. Discuss both views and give your opinion.', 250, 40),
  talk(4, 'B', 'Teachers', ['What do you study, or what is your job?', 'Why did you choose it?', 'Do you like your teachers or your colleagues?'], 'Describe a teacher who impressed you.', ['who this person was', 'what he or she taught you', 'how he or she taught'], 'and explain why this teacher impressed you.', ['Why do some people find it hard to ask for help?', 'Should schools teach students to help others?', 'Do people help each other less than in the past?']),
  // Gate 5
  task1(5, 'A', 'Sources of electricity', 'The chart below shows the share of electricity (in per cent) by source in 1990, 2005 and 2020.', 170, { type: 'bar', unit: 'per cent', categories: ['1990', '2005', '2020'], series: [{ name: 'Coal', values: [55, 40, 18] }, { name: 'Gas', values: [20, 30, 28] }, { name: 'Nuclear', values: [15, 18, 14] }, { name: 'Renewables', values: [10, 12, 40] }] }),
  task2(5, 'A', 'Waste', 'In many countries, the amount of waste produced is increasing. What are the causes of this, and what measures could be taken to reduce it?', 260, 40),
  talk(5, 'A', 'Books and skills', ['What kinds of books do you like?', 'Do you prefer reading on paper or on a screen?', 'Did you read more as a child?'], 'Describe a skill you would like to learn.', ['what the skill is', 'why you want to learn it', 'how you would learn it'], 'and explain how it would help you.', ['Which skills are most important for young people today?', 'Is it better to learn skills at school or by yourself?', 'How might work skills change in the future?']),
  task1(5, 'B', 'Water use by sector', 'The chart below shows the share of water use (in per cent) by sector in a country in 1980, 2000 and 2020.', 170, { type: 'bar', unit: 'per cent', categories: ['1980', '2000', '2020'], series: [{ name: 'Farming', values: [70, 60, 48] }, { name: 'Industry', values: [20, 25, 27] }, { name: 'Homes', values: [10, 15, 25] }] }),
  task2(5, 'B', 'Crime', 'Some people think the best way to reduce crime is longer prison sentences. Others believe there are better alternatives. Discuss both views and give your opinion.', 260, 40),
  talk(5, 'B', 'A book', ['Do you like reading?', 'When do you usually read?', 'Do you buy books or borrow them?'], 'Describe a book you have read.', ['what the book was', 'when you read it', 'what it was about'], 'and explain why you remember it.', ['Which skills are most important for young people today?', 'Is it better to learn skills at school or by yourself?', 'How might work skills change in the future?']),
  // Gate 6
  task1(6, 'A', 'Leisure activities by age', 'The chart below shows the hours per week that four age groups spent on three leisure activities in 2022.', 170, { type: 'bar', unit: 'hours per week', categories: ['Games', 'Reading', 'Exercise'], series: [{ name: 'Age 16-24', values: [12, 2, 5] }, { name: 'Age 25-44', values: [6, 3, 4] }, { name: 'Age 45-64', values: [3, 5, 3] }, { name: 'Age 65+', values: [1, 9, 3] }] }),
  task2(6, 'A', 'Public services and the arts', 'Some people believe governments should spend money on public services rather than on the arts. To what extent do you agree or disagree?', 260, 40),
  talk(6, 'A', 'Weather and decisions', ['What is the weather like in your hometown?', 'Which season do you like best?', 'Does the weather affect your mood?'], 'Describe a decision that changed your life.', ['what the decision was', 'when you made it', 'what happened after it'], 'and explain why it was important.', ['Do people make better decisions alone or in groups?', 'Are young people more willing to take risks?', 'Should schools teach decision making?']),
  task1(6, 'B', 'Spending on leisure', 'The chart below shows the average yearly spending on leisure (in dollars) of three age groups in 2010, 2015 and 2020.', 170, { type: 'bar', unit: 'US dollars', categories: ['2010', '2015', '2020'], series: [{ name: 'Age 18-30', values: [900, 1100, 1500] }, { name: 'Age 31-50', values: [1200, 1300, 1250] }, { name: 'Age 51+', values: [700, 900, 1400] }] }),
  task2(6, 'B', 'Living in the countryside', 'Fewer and fewer young people choose to live in the countryside. What are the reasons, and is this a positive or negative development?', 260, 40),
  talk(6, 'B', 'Busy times', ['Do you have a busy life?', 'How do you relax?', 'Do you prefer to be busy or to have free time?'], 'Describe a time when you were very busy.', ['when it was', 'what you had to do', 'who helped you'], 'and explain how you felt.', ['Do people make better decisions alone or in groups?', 'Are young people more willing to take risks?', 'Should schools teach decision making?']),
];
