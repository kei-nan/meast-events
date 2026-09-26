# -*- coding: utf-8 -*-
# Hand-written assessments by the reviewing model. Each finding = (rubric code, note, quote).
# Rubric codes: 1 loaded label, 2 numbers, 3 causal/agent, 4 omitted perspective, 5 tone word, 6 truncation effect.
# Ratings: 'none' = no concerns found; 'notable'; 'look' = worth a human look.
# Every quote is machine-checked to be a verbatim substring of the extract or the live lead (see build.py).
A = {}
def a(i, rating, full, reason, findings):
    A[i] = dict(rating=rating, full_rating=full, reason=reason, findings=findings)

a(0,'none','none','Neutral operational description; actor is grammatical subject.',
  [(1,'"invasion" in Wikipedia voice, actor named (British)','a British invasion of the Italian island of Kastelorizo')])
a(1,'notable','notable','"terrorist attack" is used in Wikipedia\'s own voice with the perpetrator named; the 91 dead are a bare figure; the extract omits the live lead\'s account of the disputed warnings.',
  [(1,'loaded label in own voice, perpetrator named','were bombed in a terrorist attack on 22 July 1946, by the militant right-wing Zionist underground organization Irgun'),
   (2,'bare figure, no source','Ninety-one people of various nationalities were killed, including Arabs, Britons and Jews, and 46 were injured'),
   (6,'truncation drops the warning dispute','Controversy has arisen over the timing and adequacy of any warnings. The Irgun stated subsequently that warnings were delivered by telephone')])
a(2,'notable','notable','Extract gives only the Palestinian Arab movement\'s stated aims; the full lead adds the Jewish-civilian and intra-Arab dimensions, casualty figures and a tone word ("brutally") in Wikipedia voice.',
  [(4,'extract states aims of one side; no Jewish/Yishuv perspective, no casualties','The movement sought independence from British colonial rule and the end of British support for Zionism, including Jewish immigration and land sales to Jews.'),
   (5,'tone word in Wikipedia voice (full lead only)','the rebellion was brutally suppressed by the British Army and the Palestine Police Force'),
   (2,'casualty figures attributed to named sources (full lead only)','In an analysis of the British statistics, Walid Khalidi estimates 19,792 casualties for the Arabs'),
   (6,'truncation removes the Jewish-side casualties and the "terrorist activities" attribution','Estimates of the number of Palestinian Jews killed are up to several hundred.')])
a(3,'none','none','Neutral; actors are grammatical subjects.',[])
a(4,'notable','notable','Extract omits the sectarian allocation of offices that is the pact\'s substance and the full lead\'s own-voice claim about disproportionate Christian power.',
  [(6,'truncation removes the allocation of offices','The president of the Republic and the commander of the Lebanese Armed Forces must be Maronite Catholic.'),
   (4,'full lead states in own voice','it soon became clear that Christians wielded a disproportionate amount of power')])
a(5,'none','none','Neutral military narrative. Full lead contains an unattributed evaluative aside.',
  [(5,'unattributed hedge in full lead','It has been suggested that this move snatched defeat from the jaws of victory.')])
a(6,'none','none','Neutral.',[])
a(7,'notable','notable','Extract neutrally describes the plan but omits both sides\' positions; the full lead contains contested claims in Wikipedia voice, including a bare 85% figure.',
  [(4,'truncation drops who accepted and who rejected the plan','The Arab Higher Committee, the Arab League and other Arab leaders and governments rejected the Plan'),
   (4,'contested characterisation of Zionist intent, attributed to "Zionist leaders"','viewed the acceptance of the plan as a tactical step and a steppingstone to future territorial expansion over all of Palestine'),
   (2,'bare figure in Wikipedia voice, no source (full lead)','the expulsion and flight of 85% of the Palestinians living in the areas that became the State of Israel')])
a(8,'notable','notable','"massacre" in own voice, state perpetrator named; the perpetrator general\'s ethnicity is foregrounded; no casualty figure appears anywhere in the lead.',
  [(1,'"massacre" in own voice, state as agent','was a massacre committed by the Kingdom of Iraq under the leadership of Kurdish army general Bakr Sidqi'),
   (2,'no death toll in extract or full lead','54 villages in total are said to have been targeted')])
a(9,'none','none','Neutral.',[])
a(10,'none','none','Neutral; "occupation zones" describes treaty provisions.',[])
a(11,'none','none','Neutral.',[])
a(12,'none','none','Neutral; disputes are mentioned only in the full lead.',
  [(6,'truncation removes the disputed-interpretation detail','conflicting interpretations of this description were to cause great controversy in subsequent years')])
a(13,'notable','notable','Tone word for one party ("embittered") and no mention of the British suppression in the extract.',
  [(5,'tone word','protests by embittered officers from the old Ottoman Army'),
   (6,'truncation drops the suppression','by the end of October 1920, the uprising was suppressed by the British')])
a(14,'none','none','Neutral.',[])
a(15,'look','look','Extract uses "violently expelled" and an unsourced "Hundreds ... killed" in Wikipedia voice and omits the Israeli military rationale and the range given in the full lead; Arabic/Persian leads give an expellee figure that the English lead does not.',
  [(5,'adverb in own voice','their residents were violently expelled'),
   (2,'bare figure, no source, no range','Hundreds of Palestinians were killed in multiple mass killings, including the Lydda massacre'),
   (6,'truncation drops the Israeli-side rationale (attributed to Benny Morris) and the death-toll range','From the Israeli perspective, the conquest of the towns, designed, according to Benny Morris, "to induce civilian panic and flight", averted an Arab threat to Tel Aviv'),
   (2,'range appears only in full lead','with estimates ranging from a handful to a figure of 500')])
a(16,'notable','notable','"terrorist group" in Wikipedia voice; extract omits how it ended (Israeli raid).',
  [(1,'loaded label in own voice','four members of the Black September Organization, a Palestinian terrorist group'),
   (6,'truncation omits the outcome','The standoff was ended by an Israeli commando raid in which all of the hijackers were killed or captured.')])
a(17,'look','look','A "massacre" article whose displayed extract never says who committed it or how many died; the perpetrator and toll (600-1,500) are only in the truncated part, and the extract puts PLO-controlled territory in subject position.',
  [(3,'extract names the victims\' district and its PLO/LNM control but no perpetrator','was a Muslim-inhabited district in mostly Christian East Beirut controlled by forces of the Palestine Liberation Organization (PLO) and the Lebanese National Movement (LNM)'),
   (6,'perpetrator and range only in truncated text','Karantina was overrun by militias of the right-wing and mostly Christian Lebanese Front, primarily the Kataeb Regulatory Forces (KRF) militia of the Kataeb Party (a.k.a. Phalangists), resulting in the deaths of approximately 600–1,500 people'),
   (4,'full lead adds the PLO/LNM-perpetrated Damour massacre (context)','Mass killings of civilians continued in Damour leading to the Damour massacre, which the LNM and the PLO perpetrated after the Karantina massacre')])
a(18,'notable','notable','"invaded" in own voice; extract attributes the casus belli to Begin, but omits the siege of Beirut, Sabra and Shatila and the occupation that are in the full lead.',
  [(1,'"invaded" in own voice, actor is subject','when Israel invaded southern Lebanon'),
   (3,'blame attributed to a named actor','Israeli prime minister Menachem Begin blamed the PLO, using the incident as a casus belli'),
   (2,'no casualty numbers in extract','which had caused civilian casualties on both sides of the border'),
   (6,'truncation drops Sabra and Shatila and the bombardment','There was outrage at the IDF\'s role in the Israeli-backed, Phalangist-perpetrated Sabra and Shatila massacre of Palestinians and Lebanese Shias.'),
   (1,'"occupation" in own voice (full lead)','The Israeli occupation saw the emergence of Hezbollah')])
a(19,'none','none','States purposes in Wikipedia voice ("attempt to recover the territories that they had lost") but neutral in tone.',
  [(3,'Egypt and Syria are grammatical subject of the war\'s start','Egypt and Syria launched a large-scale surprise attack in an ultimately unsuccessful attempt to recover the territories that they had lost to Israel')])
a(20,'none','notable','Displayed extract is neutral. The full lead contains many own-voice evaluations and claims that the extract does not show.',
  [(1,'"militants" and false-flag belief (full lead)','the Cinema Rex fire by Islamic militants killed around 400 people. However a large portion of the public believed it was a false flag operation by SAVAK'),
   (4,'unattributed characterisation of post-revolution Iran (full lead)','post-revolutionary Iran aimed to undermine the influence of Sunni leaders in the region by supporting Shi\'ite political ascendancy'),
   (6,'truncation removes all of these','Iran began to back Shia militancy across the region to expand its influence in the Arab world')])
a(21,'none','none','Neutral treaty description.',[])
a(22,'notable','notable','Passive voice: the extract does not say who carried out the bombings; the count includes the attackers among the dead; Wikidata category is "terrorism" although the extract does not use the word.',
  [(3,'passive, no perpetrator','two truck bombs were detonated at buildings in Beirut, Lebanon'),
   (2,'total includes attackers, unsourced','The attack killed 307 people: 241 U.S. and 58 French military personnel, six civilians and two of the attackers.'),
   (6,'attribution dispute only in truncated text','A group called Islamic Jihad claimed responsibility for the bombings')])
a(23,'notable','notable','"victory over Israel" is Egypt\'s framing of a contested war outcome stated in Wikipedia voice.',
  [(1,'contested outcome word in own voice','held in Cairo to celebrate the victory over Israel in the Yom Kippur War')])
a(24,'notable','notable','Extract omits both Israel\'s stated justification and the UN censure that the full lead includes.',
  [(6,'truncation drops the Israeli rationale','Israel stated that the attack was in response to a Palestinian fedayeen guerrilla land mine attack two days earlier'),
   (6,'and the UN censure','the United Nations responded with United Nations Security Council Resolution 228, censuring Israel')])
a(25,'none','none','Neutral.',[])
a(26,'notable','notable','Internal tension: "bloodless coup" in own voice, then executions on "fabricated" charges in own voice; also tests the extract-length (1,215 characters, no truncation).',
  [(5,'evaluative wording in own voice','publicly executing 14 people including 9 Iraqi Jews on fabricated espionage charges'),
   (1,'"bloodless" in own voice','was a bloodless coup in Iraq in 1968')])
a(27,'none','none','Numbers hedged ("up to 600"); label is "militants".',
  [(2,'hedged number','carried out by up to 600 militants led by Juhayman al-Otaybi')])
a(28,'none','none','Neutral; note Wikidata class "uprising" versus the article\'s "military coup".',[])
a(29,'notable','notable','Extract credits the republican side ("abolished slavery") and omits foreign intervention (Egypt, Saudi Arabia, Israel), which is in the full lead.',
  [(5,'favourable statement about one side in own voice','His government abolished slavery in Yemen.'),
   (6,'truncation drops foreign involvement','Egyptian President Gamal Abdel Nasser supported the republicans with as many as 70,000 Egyptian troops')])
a(30,'none','none','Extract neutral; both-sided opposition only in the full lead.',
  [(6,'truncation drops opposition on both sides','Far-right Israelis also opposed the Oslo Accords, and Israeli prime minister Yitzhak Rabin was assassinated in 1995 by a right-wing Israeli extremist for signing them.')])
a(31,'look','look','Extract lists "the Gaza Massacre" among names, gives an unattributed casualty range with Palestinian figure first and omits the rocket-fire background, both sides\' accusations and the Goldstone dispute.',
  [(1,'contested name presented as alias','also known as the First Gaza War, Operation Cast Lead, or the Gaza Massacre, and referred to as the Battle of al-Furqan by Hamas'),
   (2,'range without source; Palestinian deaths first, no civilian/combatant split','The conflict resulted in 1,166–1,417 Palestinian and 13 Israeli deaths.'),
   (6,'truncation drops rocket fire and war-crimes findings on both sides','a UN special mission, headed by the South African Justice Richard Goldstone, produced a report accusing both Palestinian militants and the Israeli army of war crimes'),
   (6,'and the later Goldstone statement','In 2011, Goldstone wrote that he did not believe that Israel intentionally targeted civilians in Gaza as a matter of policy.')])
a(32,'look','look','"Israeli-occupied" and "invaded" in own voice with no casualty figures, no Israeli account and no mention of the contested massacre claim, all of which are in the truncated part; Arabic article is titled "Jenin massacre".',
  [(1,'"occupied" and "invaded" in own voice','The Israeli military invaded the camp, and other areas under the administration of the Palestinian Authority'),
   (6,'truncation drops the massacre allegation and the investigations','Despite reports of a widespread massacre numbering hundreds of casualties by some Palestinian officials, subsequent investigations found no evidence to substantiate it'),
   (2,'casualty figures only in truncated text','official totals from Palestinian and Israeli sources confirmed between 52 and 54 Palestinians, including civilians, and 23 Israeli soldiers'),
   (4,'Israeli account of the fighting only in truncated text','Palestinian militants had prepared for a fight, booby trapping locations throughout the camp')])
a(33,'notable','notable','Passive voice: extract does not say who is blamed; the tribunal findings and Hezbollah\'s denial are only in the truncated text.',
  [(3,'passive, no perpetrator','was assassinated along with 21 others in an explosion in Beirut'),
   (6,'attribution and its limits only in truncated text','The panel of judges concluded there was "no evidence that the Hezbollah leadership had any involvement in Hariri\'s murder and there is no direct evidence of Syrian involvement."')])
a(34,'look','look','Data issue: the record\'s title is "Israeli withdrawal from Lebanon" but the extract (and wikipedia_url) is the South Lebanon conflict article; it uses "Israeli-occupied" in own voice.',
  [(1,'"occupied" in own voice','an armed conflict that took place in Israeli-occupied southern Lebanon from 1982 or 1985 until Israel\'s withdrawal in 2000'),
   (4,'title/extract mismatch (record wikipedia_url is South_Lebanon_conflict_(1985-2000))','The South Lebanon conflict was an armed conflict'),
   (6,'the withdrawal itself (the titled event) is only in the truncated text','the new Israeli prime minister Ehud Barak unilaterally withdrew Israeli forces from southern Lebanon on 25 May 2000')])
a(35,'notable','notable','Approving tone in own voice ("remarkable for its avoidance of violence"); "occupied" appears in the full lead.',
  [(5,'approving tone in own voice','The popular movement was remarkable for its avoidance of violence, peaceful approach, and its total reliance on methods of civil resistance.'),
   (1,'"occupied" in own voice (full lead)','the withdrawal of the Syrian troops which had occupied Lebanon since 1976')])
a(36,'notable','notable','Extract does not say who carried out the operation; goal stated from the operators\' perspective ("eliminate", "dismantle").',
  [(3,'operator not named','The goal of the operation was to eliminate Ansar al-Islam and dismantle the Islamic Emirate of Kurdistan.'),
   (4,'description of the target group in own voice','a Kurdish Salafist movement that imposed a strict application of Sharia in villages it controlled')])
a(37,'notable','notable','Extract says "suspected Palestinian militants" but omits the hostage dispute (Israel versus Franciscans) that the full lead records.',
  [(4,'both sides\' claims only in truncated text','The Franciscan Order maintained no hostages were held, while Israeli sources claimed the monks and others were being held hostage by gunmen.'),
   (1,'"besieged", hedged "suspected"','besieged by the Israel Defense Forces (IDF), targeting suspected Palestinian militants')])
a(38,'notable','notable','"terrorist action" in own voice; passive "committed by" with named group; bare figures.',
  [(1,'loaded label in own voice','making the attack the deadliest terrorist action in the history of Egypt'),
   (2,'bare figures','Eighty-eight people were killed by the three bombings, the majority of them Egyptians, and over 200 were injured')])
a(39,'look','look','Extract states in own voice that the Israeli military "fired artillery shells at a United Nations compound" and gives 106 dead with no Israeli explanation; Israel\'s claim and the UN finding it was deliberate are only in the truncated text.',
  [(3,'active agent, own voice','when the Israeli military fired artillery shells at a United Nations compound, which was sheltering around 800 Lebanese civilians, killing 106'),
   (6,'truncation drops Israel\'s account','According to Israel, it had launched the artillery barrage to cover an Israeli special forces unit after it had come under mortar fire'),
   (6,'and the UN finding, stated with "refuted" in Wikipedia voice','Israel\'s claims were refuted by a United Nations investigation which later found that the Israeli shelling was deliberate'),
   (1,'"occupied" in own voice','a village in then Israeli-occupied Southern Lebanon')])
a(40,'none','none','Neutral; "invasion" and "insurgency" are conventional. Omits sectarian dimensions that the full lead covers.',
  [(1,'"invasion" in own voice','beginning shortly after the 2003 American invasion deposed longtime leader Saddam Hussein')])
a(41,'notable','notable','"war crimes" in own voice with the US Army and CIA as named agents; the US government\'s position and the prosecutions are only in the truncated text.',
  [(1,'"war crimes" in own voice','members of the United States Army and the Central Intelligence Agency committed a series of human rights violations and war crimes against detainees'),
   (6,'truncation drops the government position','The George W. Bush administration stated that the abuses at Abu Ghraib were isolated incidents and not indicative of U.S. policy.')])
a(42,'notable','notable','"massacre" in Wikipedia voice with active agent; extract omits Blackwater\'s ambush claim (present in full lead) but includes convictions and pardons.',
  [(1,'"shot at Iraqi civilians" in own voice','shot at Iraqi civilians, killing 17 and injuring 20'),
   (6,'truncation drops Blackwater\'s account','Blackwater contractors claimed that the convoy was ambushed and that they fired at the attackers in defense of the convoy.')])
a(43,'none','none','Hedged ("supposed naval engagement"). Data note: record lists country Turkey for a Black Sea engagement off Abkhazia.',
  [(1,'hedge','was a supposed naval engagement between warships of the Russian Black Sea Fleet and Georgian patrol boats')])
a(44,'notable','notable','"pro-democracy" is an evaluative descriptor in own voice; the full lead also uses "counter-revolutionary".',
  [(5,'evaluative descriptor in own voice','a series of pro-democracy anti-government protests, uprisings, and armed rebellions'),
   (1,'own-voice judgement about foreign actors (full lead)','the counter-revolutionary moves by foreign state actors in Yemen')])
a(45,'look','look','A "battle" article whose displayed extract has no civilian-harm content at all and uses the epithet "Ba\'athist" repeatedly; the full lead has extensive both-sided atrocity content and a UN quote.',
  [(1,'"Ba\'athist" as repeated modifier for one party','Ba\'athist Syrian government and army'),
   (4,'extract omits civilian harm entirely','marked by widespread violence against civilians, repeated targeting of hospitals and schools (mostly by pro-government air forces but also to a lesser extent by the rebels)'),
   (2,'bare figure in full lead','leaving over 31,000 people dead in the city and the rest of the province'),
   (6,'truncation drops the balanced condemnation','All parties to the battle have been widely condemned by the UN and human rights organizations for engaging in atrocities')])
a(46,'look','look','Very recent, fast-moving article; extract states "assassinated" in own voice, omits Iranian reactions ("mixed") and the sourcing of the account.',
  [(1,'"assassinated" in own voice for a head of state killed in a military strike','Ali Khamenei, the supreme leader of Iran, was assassinated in Tehran as part of a series of Israeli airstrikes aimed at high-ranking Iranian officials'),
   (6,'truncation drops the Iranian reaction','Reactions to Khamenei\'s death in Iran were mixed. While many civilians went out to celebrate in the streets, thousands of others gathered in mourning.'),
   (4,'sourcing caveat only in truncated text','vetoed by Trump, according to unnamed US officials')])
a(47,'notable','notable','Extract presents insurgents as actors and civilians as victims; the state\'s demolitions and displacement are only in the truncated text.',
  [(1,'"Islamist militants" and "insurgency" in own voice','launched by Islamist militants against Egyptian security forces, which also included attacks on civilians'),
   (6,'truncation drops state-side harm','Hundreds of homes were demolished and thousands of residents were evacuated as Egyptian troops built a buffer zone')])
a(48,'notable','notable','"terrorist attack" in own voice; the claim of responsibility and Iran\'s accusation are only in the truncated text; Turkish-language lead attributes the label to Iran.',
  [(1,'loaded label in own voice','It was the deadliest terrorist attack in Iran since the Chabahar suicide bombing in December 2010.'),
   (6,'truncation drops claims of responsibility and Iran\'s accusation','Iran blamed "militants in Syria" and claimed the "U.S. and the Gulf states enabled the attack"')])
a(49,'look','look','Extract: "massacre" alias, an unattributed 45-50 range, "displacement camp" in own voice, Israel\'s stated target and claim of accident only in truncated text. Hebrew lead frames it differently (see cross-language).',
  [(1,'alternative names including "massacre"','Sometimes referred to as the Rafah tent massacre or as the Tent Massacre'),
   (2,'range, no source','killed between 45 and 50 Palestinians and injured more than 200'),
   (6,'truncation drops Israel\'s account','It claimed it attacked an outer "Hamas compound" and accidentally set off the fire.'),
   (4,'and the counter-evidence, attributed to Amnesty and unnamed sources','An investigation by Amnesty International concluded that militants were in the camp, but that Israel knowingly put civilians at risk.')])
a(50,'none','none','Neutral.',[])
a(51,'look','look','"regime" and "totalitarian hereditary dictatorship" in Wikipedia\'s own voice; HTS is named without any note of how it is designated by others. Extract\'s "1971" differs from the live lead\'s "1970" (stale extract).',
  [(1,'"regime" and a strong characterisation in own voice','which had governed Syria as a totalitarian hereditary dictatorship since Hafez al-Assad assumed power in 1971 after a successful coup d\'état'),
   (1,'"regime" as headline term','On 8 December 2024, the Assad regime in Syria collapsed during a major offensive by opposition forces.'),
   (6,'live lead differs from stored extract (1970 vs 1971)','since Hafez al-Assad assumed power in 1970 after a successful coup d\'état')])
a(52,'notable','notable','Tone word ("raged") and "authoritarian regime" in own voice; the election figure is reported as "A report claims".',
  [(5,'tone word','a series of major anti-government protests and armed uprisings that raged through Yemen'),
   (1,'"authoritarian regime" in own voice','the authoritarian regime led by President Ali Abdullah Saleh'),
   (2,'attributed number (full lead)','A report claims that the election had a 65% turnout, with Hadi receiving 99.8% of the vote.')])
a(53,'look','look','Wikidata class is "war crime" but the extract does not use that phrase and the lead contains no Israeli response; numbers are bare, with an unsourced range.',
  [(2,'bare figures with vague range','killing 18 Palestinian civilians and injuring between 12 and "at least 20"'),
   (4,'no Israeli account in the lead (the extract is the entire lead)','The church building itself was not damaged.'),
   (3,'active agent, own voice','was destroyed during an Israeli airstrike')])
a(54,'notable','notable','Extract covers expansion of the accords; the Arab public/Palestinian objection is only in the truncated text.',
  [(4,'reactions only in truncated text','public opinion in many countries remained opposed, particularly due to the Accords\' lack of progress on resolving the Israeli–Palestinian conflict'),
   (6,'and the terms of each normalisation','In Morocco\'s case, normalization came with U.S. recognition of Moroccan sovereignty over Western Sahara.')])
a(55,'notable','notable','"genocide" in own voice (no attribution to the UN or others in the extract); Peshmerga "abandoned" is a causal claim in own voice; "thousands" is unquantified.',
  [(1,'"genocide" in own voice','marked the beginning of the genocide of Yazidis by ISIL'),
   (3,'blame-shifting causal framing','The massacre began after the Peshmerga abandoned Sinjar without warning'),
   (2,'vague number','the killing and abduction of thousands of Yazidi men, women and children')])
a(56,'none','none','Extract neutral ("captured"); full lead uses "liberation" in own voice for the later recapture; Wikidata class is "military operation".',
  [(1,'"liberation" in own voice (full lead)','ended in its liberation in July the following year')])
a(57,'look','look','Coalition\'s legal basis ("at the request of") and "Houthi insurgents" in the extract; civilian casualties and criticism are only in the truncated text.',
  [(3,'legal framing from one side','staged a military intervention in Yemen at the request of Yemeni president Abdrabbuh Mansur Hadi, who had been ousted from the capital, Sanaa, in September 2014 by Houthi insurgents'),
   (6,'truncation drops criticism','The intervention drew criticism from some governments, international organizations, and human rights groups, which stated that it contributed to civilian casualties')])
a(58,'none','none','Neutral.',[])
a(59,'none','none','Causal framing points to the government\'s action; neutral tone.',
  [(3,'cause attributed to government action','The conflict was sparked in 2004 by the government\'s attempt to arrest Hussein al-Houthi')])
