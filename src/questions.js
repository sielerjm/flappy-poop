// Education mode's question bank (plan 21), NO Phaser/DOM. The source of truth
// for the cards since 2026-11-12 (converted from the draft bank of 2026-11-11,
// now .claude/plans/Archive/).
//
// Card: { id, deck, q, answer, wrong: [w1, w2], explain, refs, retired?, zh? }
//   id       permanent ('ST-01'): scheduler state, audits and logged answers key
//            on it, so a card is never renumbered or reused; a wrong card is
//            retired, not deleted
//   deck     a LEVELS key (the gut segment whose level introduces it) or 'general'
//   q        the question; answer the right option; wrong the two wrong ones
//            (common misconceptions where possible; shuffled at display time)
//   explain  shown after the answer: one or two sentences, at most 30 words
//   refs     REFERENCES numbers the card rests on
//   retired  true: never shown again (the id stays, so old answers still resolve)
//   zh       optional { q, answer, wrong, explain } in zh-Hans; English otherwise
//
// Facts are unaudited until src/questionAudits.js holds an audit whose hash
// matches the card (tools/audit_questions.mjs marks them). Writing rules: one
// fact per card, answerable in under 10 s on a phone; how the gut and its
// microbes work, never the player's own health, diet or habits, and no health or
// treatment advice; numbers only where the options differ by at least 10x.
//
// The general deck (cards about the microbiome as a whole, mixed into every
// level) is provisional: ST-10, JE-06, JE-08, JE-09, CO-02, RE-09 and IL-10,
// awaiting Michael's confirmation. Moving a card between decks keeps its audit.

import { LEVELS } from './config.js';

/** The decks, in level order, then the general deck. */
export const DECKS = [...LEVELS.map((l) => l.key), 'general'];

/** Every card, live and retired, in bank order (deck by deck). */
export const CARDS = [
  // ST: level 1, the stomach
  { id: 'ST-01', deck: 'stomach', q: 'Why do so few microbes live in the stomach?', answer: 'It is strongly acidic', wrong: ['It is too cold', 'No food reaches it'], explain: "Stomach acid kills most microbes we swallow, so it is the gut's first barrier.", refs: [1] },
  { id: 'ST-02', deck: 'stomach', q: "How acidic is the stomach's juice?", answer: 'Around pH 2, like lemon juice', wrong: ['About pH 7, like water', 'About pH 10, like soapy water'], explain: 'Gastric juice usually sits between pH 1.5 and 3.5, acidic enough to kill most bacteria.', refs: [1] },
  { id: 'ST-03', deck: 'stomach', q: 'Which bacterium lives in the stomachs of about half the people on Earth?', answer: 'Helicobacter pylori', wrong: ['Clostridioides difficile', 'Vibrio cholerae'], explain: "H. pylori infects roughly half the world's population; most carriers never notice it.", refs: [3] },
  { id: 'ST-04', deck: 'stomach', q: 'How does H. pylori survive stomach acid?', answer: 'It makes ammonia to neutralise the acid around it', wrong: ['It builds a hard shell like a seed', "It hides inside our stomach cells' nuclei"], explain: 'Its enzyme urease turns urea into ammonia, creating a less acidic bubble around the bacterium.', refs: [4] },
  { id: 'ST-05', deck: 'stomach', q: 'How did Barry Marshall show that H. pylori inflames the stomach?', answer: 'He drank a culture of it', wrong: ['He studied it only in mice', 'He took antibiotics for a year'], explain: 'In 1984 he swallowed the bacteria and developed gastritis. He later shared the 2005 Nobel Prize for this work.', refs: [5] },
  { id: 'ST-06', deck: 'stomach', q: 'Where do most microbes found in the stomach come from?', answer: 'They are swallowed from the mouth', wrong: ['They travel up from the colon', 'They grow out of the stomach wall'], explain: 'We swallow saliva all day, and many oral bacteria are found further down the gut too.', refs: [6] },
  { id: 'ST-07', deck: 'stomach', q: 'Is a healthy stomach sterile?', answer: 'No, it has a small community of microbes', wrong: ['Yes, completely', "It holds most of the gut's microbes"], explain: 'DNA surveys found a diverse but sparse community in the human stomach.', refs: [7] },
  { id: 'ST-08', deck: 'stomach', q: 'Medicines that lower stomach acid tend to let more of which microbes reach the intestine?', answer: 'Mouth bacteria', wrong: ['Skin bacteria', 'Soil bacteria'], explain: 'With less acid, more swallowed oral bacteria survive; people taking these drugs show more mouth-type bacteria in stool.', refs: [8] },
  { id: 'ST-09', deck: 'stomach', q: 'About how many microbes are in each millilitre of stomach contents?', answer: 'About 10 to 1,000', wrong: ['About a million million', 'About a billion billion'], explain: 'The stomach holds tiny numbers compared with the colon, which carries around 100 billion per gram.', refs: [2] },
  { id: 'ST-10', deck: 'general', q: 'What does "gut microbiome" mean?', answer: 'The community of microbes living in the gut, and their genes', wrong: ['Only the microbes that cause disease', 'One species of helpful bacteria'], explain: 'It includes bacteria, archaea, fungi and viruses, most of them harmless.', refs: [9] },
  // DU: level 2, the duodenum
  { id: 'DU-01', deck: 'duodenum', q: 'Which digestive fluid poured into the duodenum makes life hard for bacteria?', answer: 'Bile', wrong: ['Saliva', 'Tears'], explain: 'Bile from the liver helps digest fat and is also toxic to many bacteria.', refs: [10] },
  { id: 'DU-02', deck: 'duodenum', q: 'How does bile harm bacteria?', answer: 'It acts like a detergent and damages their membranes', wrong: ['It freezes them', 'It blocks their access to light'], explain: 'Bile acids dissolve fats, including the fatty membranes around bacterial cells.', refs: [10] },
  { id: 'DU-03', deck: 'duodenum', q: 'Many gut bacteria resist bile with an enzyme called what?', answer: 'Bile salt hydrolase', wrong: ['Amylase', 'Lactase'], explain: 'Bile salt hydrolase changes bile acids into forms that are less harmful to the bacterium.', refs: [10] },
  { id: 'DU-04', deck: 'duodenum', q: 'Compared with the colon, how many microbes does the duodenum hold?', answer: 'Far fewer', wrong: ['About the same', 'Far more'], explain: 'Acid and bile keep duodenal numbers low, roughly 1,000 per millilitre against about 100 billion in the colon.', refs: [11] },
  { id: 'DU-05', deck: 'duodenum', q: 'A landmark 2013 trial delivered donor stool into the duodenum. Which infection did it treat?', answer: 'Recurrent C. difficile infection', wrong: ['The common cold', 'H. pylori infection'], explain: 'Stool transplants cured recurrent C. difficile far more often than antibiotics alone in that trial.', refs: [12] },
  { id: 'DU-06', deck: 'duodenum', q: 'What is a fecal microbiota transplant?', answer: "Moving gut microbes from a healthy donor's stool into a patient", wrong: ['Transplanting a piece of intestine', 'A pill containing one bacterial species'], explain: 'It replaces a disrupted community with a whole donor community, not a single strain.', refs: [12] },
  { id: 'DU-07', deck: 'duodenum', q: 'How common are fungi in the gut compared with bacteria?', answer: 'Much rarer', wrong: ['Much more common', 'About equal'], explain: 'Fungi make up a small share of gut microbes; common ones include Saccharomyces and Candida.', refs: [13] },
  { id: 'DU-08', deck: 'duodenum', q: 'Bacteria common in the upper small intestine, such as Streptococcus, are also common where?', answer: 'In the mouth', wrong: ['On the skin', 'In the soil'], explain: "Upper small-intestine communities resemble oral ones more than the colon's.", refs: [14] },
  { id: 'DU-09', deck: 'duodenum', q: 'Most bacteria in the upper small intestine can do what?', answer: 'Survive with or without oxygen', wrong: ['Survive only without oxygen', 'Make food from sunlight'], explain: 'Some oxygen reaches the upper gut, so oxygen-tolerant bacteria do well there.', refs: [2] },
  { id: 'DU-10', deck: 'duodenum', q: 'Why do we know less about small-intestine microbes than about stool microbes?', answer: 'The small intestine is hard to sample', wrong: ['It has no microbes', 'Its microbes cannot be identified'], explain: 'Sampling needs a tube, a capsule or surgery, while stool is easy to collect.', refs: [14] },
  // JE: level 3, the jejunum
  { id: 'JE-01', deck: 'jejunum', q: 'Besides acid and bile, what keeps microbe numbers low in the small intestine?', answer: 'Contents move through quickly', wrong: ['It gets no food', 'It is exposed to light'], explain: 'Fast flow washes microbes onward before they can build up large populations.', refs: [14] },
  { id: 'JE-02', deck: 'jejunum', q: 'Small-intestine microbes compete with whom for simple sugars?', answer: 'You, the host', wrong: ['Viruses only', 'Nobody; sugars go untouched'], explain: 'Both we and our microbes absorb simple sugars here, so microbes that grab them fast do well.', refs: [15] },
  { id: 'JE-03', deck: 'jejunum', q: 'Without enough lactase, where does undigested milk sugar end up?', answer: 'In the colon, where bacteria ferment it', wrong: ['It stays in the stomach', 'It is absorbed anyway'], explain: 'Colon bacteria ferment leftover lactose, and the gas they make causes the bloating of lactose intolerance.', refs: [16] },
  { id: 'JE-04', deck: 'jejunum', q: "How does mucus in the small intestine differ from the colon's?", answer: 'It is a single, looser layer', wrong: ['There is no mucus there', 'It is thicker, with two layers'], explain: 'The colon has a dense inner layer that keeps bacteria off the wall; the small intestine relies more on antimicrobial molecules.', refs: [17] },
  { id: 'JE-05', deck: 'jejunum', q: 'Travelling from the small intestine to the colon, oxygen levels do what?', answer: 'Fall', wrong: ['Rise', 'Stay the same'], explain: 'The colon is almost oxygen-free, which shapes which microbes can live there.', refs: [2] },
  { id: 'JE-06', deck: 'general', q: 'How many genes does your gut microbiome carry compared with your own genome?', answer: 'About 150 times more', wrong: ['About the same', 'About 10 times fewer'], explain: 'A 2010 gene catalogue counted about 3.3 million microbial genes, against roughly 20,000 human genes.', refs: [18] },
  { id: 'JE-07', deck: 'jejunum', q: 'Besides bacteria, which other kind of single-celled life lives in the human gut?', answer: 'Archaea', wrong: ['Plants', 'Algae'], explain: "Archaea such as Methanobrevibacter smithii live in many people's guts and make methane.", refs: [19] },
  { id: 'JE-08', deck: 'general', q: 'Most viruses in the gut infect what?', answer: 'Bacteria', wrong: ['Human cells', 'Fungi'], explain: 'Gut viruses are mostly bacteriophages, which shape bacterial communities by infecting them.', refs: [20] },
  { id: 'JE-09', deck: 'general', q: 'Do most gut bacteria cause disease?', answer: 'No; most are harmless or helpful', wrong: ['Yes, almost all', 'About half do'], explain: 'Healthy people carry hundreds of bacterial species without getting sick.', refs: [9] },
  { id: 'JE-10', deck: 'jejunum', q: 'Roughly how large is the inside surface of your whole digestive tract?', answer: 'About half a badminton court', wrong: ['About a tennis court', 'About a postcard'], explain: 'A 2014 study revised the old tennis-court estimate down to about 32 square metres, with villi and folds doing most of the work.', refs: [21] },
  // IL: level 4, the ileum
  { id: 'IL-01', deck: 'ileum', q: 'What do Paneth cells in the small intestine release to control microbes?', answer: 'Antimicrobial peptides', wrong: ['Bile', 'Stomach acid'], explain: 'Paneth cells sit at the base of intestinal crypts and release small proteins that kill or block bacteria.', refs: [22] },
  { id: 'IL-02', deck: 'ileum', q: 'What happens to most bile acids after they help digest fat?', answer: 'They are reabsorbed in the ileum and recycled', wrong: ['They leave the body in stool', 'They are destroyed in the stomach'], explain: 'About 95% of bile acids are taken back up at the end of the small intestine and returned to the liver.', refs: [23] },
  { id: 'IL-03', deck: 'ileum', q: 'Moving down the small intestine, microbe numbers do what?', answer: 'Rise steadily', wrong: ['Fall', 'Stay the same'], explain: 'Numbers climb from about 1,000 per millilitre near the stomach to tens of millions in the ileum.', refs: [2] },
  { id: 'IL-04', deck: 'ileum', q: 'What helps stop colon bacteria from flowing back into the ileum?', answer: 'The ileocecal valve', wrong: ['The appendix', "The stomach's exit valve"], explain: 'This valve between the small and large intestine limits backflow from the dense colon community.', refs: [14] },
  { id: 'IL-05', deck: 'ileum', q: "How fast can the ileum's microbial community change?", answer: 'Within hours to days', wrong: ['It never changes', 'Only once a year'], explain: 'Studies of people with an ileostomy found ileal communities shift quickly over time.', refs: [24] },
  { id: 'IL-06', deck: 'ileum', q: 'What are the clusters of immune tissue in the ileum that sample gut microbes called?', answer: "Peyer's patches", wrong: ['Villi', 'Taste buds'], explain: "Peyer's patches take up microbes and their molecules from the gut and show them to immune cells.", refs: [25] },
  { id: 'IL-07', deck: 'ileum', q: 'Which antibody does the gut release in large amounts to coat microbes?', answer: 'IgA', wrong: ['IgE', 'Insulin'], explain: 'IgA is the most abundant antibody our bodies make; much of it coats gut bacteria without killing them.', refs: [26] },
  { id: 'IL-08', deck: 'ileum', q: 'How does a healthy immune system treat resident gut microbes?', answer: 'It keeps them in check without attacking them all', wrong: ['It tries to kill every one', 'It ignores them completely'], explain: 'The gut immune system tolerates resident microbes while keeping them away from the gut wall.', refs: [27] },
  { id: 'IL-09', deck: 'ileum', q: 'Colon bacteria make vitamin B12, but we absorb B12 in the ileum. Why does colon-made B12 help us little?', answer: 'It is made downstream of where B12 is absorbed', wrong: ['Our bodies cannot use B12 at all', 'Bacteria eat all of it in the stomach'], explain: 'We rely on B12 from food; much bacterial B12 is made in the colon, past the ileum.', refs: [28] },
  { id: 'IL-10', deck: 'general', q: 'Can gut microbes pass between people who live together?', answer: 'Yes, household members share strains', wrong: ['No, never', 'Only between identical twins'], explain: 'A 2023 study found people living together share many gut bacterial strains.', refs: [29] },
  // CA: level 5, the caecum
  { id: 'CA-01', deck: 'caecum', q: 'What do gut bacteria make when they ferment fibre?', answer: 'Short-chain fatty acids', wrong: ['Sugar', 'Protein'], explain: 'Fermenting fibre produces short-chain fatty acids that our own cells absorb and use.', refs: [30] },
  { id: 'CA-02', deck: 'caecum', q: 'Which of these is a short-chain fatty acid made by gut bacteria?', answer: 'Butyrate', wrong: ['Cholesterol', 'Glucose'], explain: 'The three main ones are acetate, propionate and butyrate.', refs: [30] },
  { id: 'CA-03', deck: 'caecum', q: 'One idea about the appendix is that it does what?', answer: 'Stores gut bacteria to restock the colon', wrong: ['Makes stomach acid', 'Digests bone'], explain: 'This is a hypothesis: the appendix may shelter a reserve of microbes after diarrhoea flushes the colon.', refs: [31] },
  { id: 'CA-04', deck: 'caecum', q: 'Which animal relies on a huge caecum to ferment plants?', answer: 'Rabbit', wrong: ['Cat', 'Eagle'], explain: 'Hindgut fermenters such as rabbits and horses have a large caecum full of fibre-digesting microbes.', refs: [32] },
  { id: 'CA-05', deck: 'caecum', q: 'Why do rabbits eat some of their own droppings?', answer: 'To absorb nutrients their caecum microbes made', wrong: ['To clean their burrow', 'Because they are thirsty'], explain: 'Soft caecal pellets carry vitamins and protein made by microbes, which the rabbit absorbs on a second pass.', refs: [32] },
  { id: 'CA-06', deck: 'caecum', q: 'In humans, what is the caecum?', answer: 'The start of the large intestine', wrong: ['Where food is first chewed', 'Where bile is made'], explain: 'Leftover food enters the caecum from the ileum, and large-scale fermentation begins.', refs: [2] },
  { id: 'CA-07', deck: 'caecum', q: 'Why can gut bacteria digest fibre when we cannot?', answer: 'They carry far more carbohydrate-digesting enzymes', wrong: ['Fibre melts in the colon', 'Our teeth break it down'], explain: 'Gut microbes encode thousands of enzymes for plant carbohydrates; our own genome has only a few dozen.', refs: [33] },
  { id: 'CA-08', deck: 'caecum', q: 'What is a prebiotic?', answer: 'Food that gut microbes selectively use, with a health benefit', wrong: ['A live bacterium', 'A medicine that kills bacteria'], explain: 'Certain fibres count as prebiotics because helpful gut microbes use them.', refs: [34] },
  { id: 'CA-09', deck: 'caecum', q: 'What is a probiotic?', answer: 'Live microbes that give a health benefit in adequate amounts', wrong: ['Any food with fibre', 'A drug that kills bacteria'], explain: 'The definition requires a shown benefit; not every product with live microbes qualifies.', refs: [35] },
  { id: 'CA-10', deck: 'caecum', q: 'In mouse experiments, low-fibre diets over several generations led to what?', answer: 'Gut microbes were lost and did not return with fibre alone', wrong: ['Microbes became more diverse', 'Nothing changed'], explain: 'Species lost over generations came back only when the missing microbes were reintroduced.', refs: [36] },
  // CO: level 6, the colon
  { id: 'CO-01', deck: 'colon', q: 'Where in the gut do most microbes live?', answer: 'The colon', wrong: ['The stomach', 'The small intestine'], explain: 'The colon holds the vast majority of gut microbes, around 100 billion per millilitre of contents.', refs: [11] },
  { id: 'CO-02', deck: 'general', q: 'How does the number of bacterial cells in your body compare with your own cells?', answer: 'About equal', wrong: ['About 10 times more bacteria', 'About 100 times fewer bacteria'], explain: 'The popular 10-to-1 claim was revised in 2016 to roughly 38 trillion bacteria and 30 trillion human cells.', refs: [11] },
  { id: 'CO-03', deck: 'colon', q: 'What is the main fuel for the cells lining your colon?', answer: 'Butyrate made by gut bacteria', wrong: ['Glucose from the blood', 'Stomach acid'], explain: 'Colon lining cells get most of their energy from butyrate produced by fermenting bacteria.', refs: [37] },
  { id: 'CO-04', deck: 'colon', q: 'Most bacteria in the colon are what kind?', answer: 'Anaerobes that do not tolerate oxygen', wrong: ['Bacteria that need oxygen', 'Bacteria that use sunlight'], explain: 'Colon cells use up oxygen at the gut wall, keeping the colon almost oxygen-free.', refs: [38] },
  { id: 'CO-05', deck: 'colon', q: 'What keeps colon bacteria off the gut wall?', answer: 'A dense inner mucus layer', wrong: ['Stomach acid', 'A layer of fat'], explain: "The colon's inner mucus layer is nearly bacteria-free, while bacteria live in the looser outer layer.", refs: [39] },
  { id: 'CO-06', deck: 'colon', q: 'Which two bacterial groups dominate most adult guts?', answer: 'Bacillota and Bacteroidota', wrong: ['Cyanobacteria and Spirochaetes', 'Proteobacteria and Chlamydiae'], explain: 'These phyla were renamed in 2021; many sources still call them Firmicutes and Bacteroidetes.', refs: [40, 41] },
  { id: 'CO-07', deck: 'colon', q: 'Which vitamin do gut bacteria help make?', answer: 'Vitamin K', wrong: ['Vitamin C', 'Vitamin D'], explain: 'Gut bacteria make forms of vitamin K2 and several B vitamins.', refs: [42] },
  { id: 'CO-08', deck: 'colon', q: 'What do colon bacteria turn some bile acids into?', answer: 'Secondary bile acids', wrong: ['Stomach acid', 'Sugar'], explain: 'Bacteria chemically modify bile acids that escape recycling, producing secondary bile acids.', refs: [23] },
  { id: 'CO-09', deck: 'colon', q: 'What usually happens to gut bacteria during a course of antibiotics?', answer: 'Diversity drops, and recovery can be incomplete', wrong: ['All bacteria die permanently', 'Nothing changes'], explain: 'In a 2011 study, communities mostly recovered within weeks, but some species did not return.', refs: [43] },
  { id: 'CO-10', deck: 'colon', q: 'How quickly can a big diet change shift your gut microbiome?', answer: 'Within a day or two', wrong: ['Only after several years', 'Never'], explain: 'In a 2014 study, switching to an all-plant or all-animal diet changed the microbiome within days.', refs: [44] },
  // RE: level 7, the rectum
  { id: 'RE-01', deck: 'rectum', q: "What makes up a large share of stool's solid matter?", answer: 'Bacteria', wrong: ['Undigested meat', 'Dead stomach cells'], explain: "Bacteria account for roughly half of stool's dry mass, much more than leftover food.", refs: [45] },
  { id: 'RE-02', deck: 'rectum', q: 'Which gases do gut microbes make that end up in farts?', answer: 'Hydrogen, carbon dioxide and methane', wrong: ['Oxygen and ozone', 'Helium and neon'], explain: 'Fermentation releases hydrogen and carbon dioxide; methane comes from archaea present in some people.', refs: [19] },
  { id: 'RE-03', deck: 'rectum', q: 'Does stool show exactly which microbes live on the gut wall?', answer: 'No, wall-attached communities differ', wrong: ['Yes, it matches exactly', 'Stool contains no microbes'], explain: "Stool mostly reflects microbes in the gut's contents; communities attached to the gut lining differ.", refs: [46] },
  { id: 'RE-04', deck: 'rectum', q: 'What does the Bristol Stool Scale describe?', answer: 'Stool shape, a rough guide to how fast food moves through', wrong: ['Stool colour', 'How many bacteria are in stool'], explain: 'Its seven types run from hard lumps (slow transit) to liquid (fast transit).', refs: [47] },
  { id: 'RE-05', deck: 'rectum', q: 'People with firmer stool (slower transit) tend to have gut microbiomes that are what?', answer: 'More species-rich', wrong: ['Less species-rich', 'Sterile'], explain: 'A 2016 study linked stool consistency strongly with microbial richness and composition.', refs: [48] },
  { id: 'RE-06', deck: 'rectum', q: 'Does how a baby is born affect its first gut microbes?', answer: 'Yes; vaginal and caesarean births start babies with different microbes', wrong: ['No, all babies start the same', 'Babies are born with an adult microbiome'], explain: "Vaginally born babies first pick up microbes resembling their mother's vaginal community; caesarean-born babies, skin-like ones.", refs: [49] },
  { id: 'RE-07', deck: 'rectum', q: 'Special sugars in breast milk mainly feed whom?', answer: 'Gut bacteria such as Bifidobacterium', wrong: ["The baby's own cells", 'Nobody; they are waste'], explain: 'Babies cannot digest human milk oligosaccharides, but certain gut bacteria can.', refs: [50] },
  { id: 'RE-08', deck: 'rectum', q: "Around what age does a child's gut microbiome become adult-like?", answer: 'About 3 years', wrong: ['About 3 months', 'About 30 years'], explain: 'Gut communities change fast in infancy and settle into an adult-like state by about age three.', refs: [51] },
  { id: 'RE-09', deck: 'general', q: "How similar are two healthy people's gut microbiomes?", answer: "Quite different; each person's is unique", wrong: ['Identical', 'Identical within the same country'], explain: 'Healthy people differ widely in which species they carry, even when their microbes do similar jobs.', refs: [9] },
  { id: 'RE-10', deck: 'rectum', q: "How long do most bacterial strains stay in an adult's gut?", answer: 'Years, often decades', wrong: ['A few days', 'A few weeks'], explain: 'A 2013 study found most strains stayed over five years and projected many would last decades.', refs: [52] },
];

/** The bank's sources, by number (a card's refs). Cited from memory on 2026-11-11 and not yet re-read: an audit checks the citation along with the claim. */
export const REFERENCES = {
  1: 'Martinsen TC, Bergh K, Waldum HL (2005). Gastric juice: a barrier against infectious diseases. Basic Clin Pharmacol Toxicol 96:94–102.',
  2: 'Donaldson GP, Lee SM, Mazmanian SK (2016). Gut biogeography of the bacterial microbiota. Nat Rev Microbiol 14:20–32.',
  3: 'Hooi JKY et al. (2017). Global prevalence of Helicobacter pylori infection: systematic review and meta-analysis. Gastroenterology 153:420–429.',
  4: 'Kusters JG, van Vliet AHM, Kuipers EJ (2006). Pathogenesis of Helicobacter pylori infection. Clin Microbiol Rev 19:449–490.',
  5: "Marshall BJ et al. (1985). Attempt to fulfil Koch's postulates for pyloric Campylobacter. Med J Aust 142:436–439.",
  6: 'Schmidt TSB et al. (2019). Extensive transmission of microbes along the gastrointestinal tract. eLife 8:e42693.',
  7: 'Bik EM et al. (2006). Molecular analysis of the bacterial microbiota in the human stomach. PNAS 103:732–737.',
  8: 'Imhann F et al. (2016). Proton pump inhibitors affect the gut microbiome. Gut 65:740–748.',
  9: 'Human Microbiome Project Consortium (2012). Structure, function and diversity of the healthy human microbiome. Nature 486:207–214.',
  10: 'Begley M, Gahan CGM, Hill C (2005). The interaction between bacteria and bile. FEMS Microbiol Rev 29:625–651.',
  11: 'Sender R, Fuchs S, Milo R (2016). Revised estimates for the number of human and bacteria cells in the body. PLoS Biol 14:e1002533.',
  12: 'van Nood E et al. (2013). Duodenal infusion of donor feces for recurrent Clostridium difficile. N Engl J Med 368:407–415.',
  13: 'Nash AK et al. (2017). The gut mycobiome of the Human Microbiome Project healthy cohort. Microbiome 5:153.',
  14: 'Kastl AJ et al. (2020). The structure and function of the human small intestinal microbiota: current understanding and future directions. Cell Mol Gastroenterol Hepatol 9:33–45.',
  15: 'Zoetendal EG et al. (2012). The human small intestinal microbiota is driven by rapid uptake and conversion of simple carbohydrates. ISME J 6:1415–1426.',
  16: 'Misselwitz B et al. (2019). Update on lactose malabsorption and intolerance. Gut 68:2080–2091.',
  17: 'Johansson MEV, Larsson JMH, Hansson GC (2011). The two mucus layers of colon are organized by the MUC2 mucin, whereas the outer layer is a legislator of host–microbial interactions. PNAS 108 Suppl 1:4659–4665.',
  18: 'Qin J et al. (2010). A human gut microbial gene catalogue established by metagenomic sequencing. Nature 464:59–65.',
  19: 'Gaci N et al. (2014). Archaea and the human gut: new beginning of an old story. World J Gastroenterol 20:16062–16078.',
  20: 'Shkoporov AN, Hill C (2019). Bacteriophages of the human gut: the "known unknown" of the microbiome. Cell Host Microbe 25:195–209.',
  21: 'Helander HF, Fändriks L (2014). Surface area of the digestive tract – revisited. Scand J Gastroenterol 49:681–689.',
  22: 'Bevins CL, Salzman NH (2011). Paneth cells, antimicrobial peptides and maintenance of intestinal homeostasis. Nat Rev Microbiol 9:356–368.',
  23: 'Ridlon JM, Kang DJ, Hylemon PB (2006). Bile salt biotransformations by human intestinal bacteria. J Lipid Res 47:241–259.',
  24: 'Booijink CCGM et al. (2010). High temporal and inter-individual variation detected in the human ileal microbiota. Environ Microbiol 12:3213–3227.',
  25: "Jung C, Hugot JP, Barreau F (2010). Peyer's patches: the immune sensors of the intestine. Int J Inflam 2010:823710.",
  26: 'Macpherson AJ et al. (2008). The immune geography of IgA induction and function. Mucosal Immunol 1:11–22.',
  27: 'Belkaid Y, Hand TW (2014). Role of the microbiota in immunity and inflammation. Cell 157:121–141.',
  28: 'Degnan PH, Taga ME, Goodman AL (2014). Vitamin B12 as a modulator of gut microbial ecology. Cell Metab 20:769–778.',
  29: 'Valles-Colomer M et al. (2023). The person-to-person transmission landscape of the gut and oral microbiomes. Nature 614:125–135.',
  30: 'Koh A et al. (2016). From dietary fiber to host physiology: short-chain fatty acids as key bacterial metabolites. Cell 165:1332–1345.',
  31: 'Bollinger RR et al. (2007). Biofilms in the large bowel suggest an apparent function of the human vermiform appendix. J Theor Biol 249:826–831.',
  32: 'Stevens CE, Hume ID (1998). Contributions of microbes in vertebrate gastrointestinal tract to production and conservation of nutrients. Physiol Rev 78:393–427.',
  33: 'El Kaoutari A et al. (2013). The abundance and variety of carbohydrate-active enzymes in the human gut microbiota. Nat Rev Microbiol 11:497–504.',
  34: 'Gibson GR et al. (2017). Expert consensus document: the ISAPP consensus statement on the definition and scope of prebiotics. Nat Rev Gastroenterol Hepatol 14:491–502.',
  35: 'Hill C et al. (2014). Expert consensus document: the ISAPP consensus statement on the scope and appropriate use of the term probiotic. Nat Rev Gastroenterol Hepatol 11:506–514.',
  36: 'Sonnenburg ED et al. (2016). Diet-induced extinctions in the gut microbiota compound over generations. Nature 529:212–215.',
  37: 'Roediger WEW (1980). Role of anaerobic bacteria in the metabolic welfare of the colonic mucosa in man. Gut 21:793–798.',
  38: 'Litvak Y, Byndloss MX, Bäumler AJ (2018). Colonocyte metabolism shapes the gut microbiota. Science 362:eaat9076.',
  39: 'Johansson MEV et al. (2008). The inner of the two Muc2 mucin-dependent mucus layers in colon is devoid of bacteria. PNAS 105:15064–15069.',
  40: 'Rinninella E et al. (2019). What is the healthy gut microbiota composition? Microorganisms 7:14.',
  41: 'Oren A, Garrity GM (2021). Valid publication of the names of forty-two phyla of prokaryotes. Int J Syst Evol Microbiol 71:005056.',
  42: 'LeBlanc JG et al. (2013). Bacteria as vitamin suppliers to their host: a gut microbiota perspective. Curr Opin Biotechnol 24:160–168.',
  43: 'Dethlefsen L, Relman DA (2011). Incomplete recovery and individualized responses of the human distal gut microbiota to repeated antibiotic perturbation. PNAS 108 Suppl 1:4554–4561.',
  44: 'David LA et al. (2014). Diet rapidly and reproducibly alters the human gut microbiome. Nature 505:559–563.',
  45: 'Stephen AM, Cummings JH (1980). The microbial contribution to human faecal mass. J Med Microbiol 13:45–56.',
  46: 'Zoetendal EG et al. (2002). Mucosa-associated bacteria in the human gastrointestinal tract are uniformly distributed along the colon and differ from the community recovered from feces. Appl Environ Microbiol 68:3401–3407.',
  47: 'Lewis SJ, Heaton KW (1997). Stool form scale as a useful guide to intestinal transit time. Scand J Gastroenterol 32:920–924.',
  48: 'Vandeputte D et al. (2016). Stool consistency is strongly associated with gut microbiota richness and composition, enterotypes and bacterial growth rates. Gut 65:57–62.',
  49: 'Dominguez-Bello MG et al. (2010). Delivery mode shapes the acquisition and structure of the initial microbiota across multiple body habitats in newborns. PNAS 107:11971–11975.',
  50: 'Marcobal A, Sonnenburg JL (2012). Human milk oligosaccharide consumption by intestinal microbiota. Clin Microbiol Infect 18 Suppl 4:12–15.',
  51: 'Yatsunenko T et al. (2012). Human gut microbiome viewed across age and geography. Nature 486:222–227.',
  52: 'Faith JJ et al. (2013). The long-term stability of the human gut microbiota. Science 341:1237439.',
};
