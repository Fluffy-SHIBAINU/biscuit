# Biscuit: a simulated user trial (October 29, 2026)

The founder asked for MiroFish-style simulated users to try Biscuit and point at enhancements. MiroFish needs Zep Cloud
for its memory graph and there is no Zep key, so the trial runs on a harness of our own (`scripts/trial/`): 36 personas
written from the product's own brief (22 seniors living alone, 10 adult children, 2 home care aides, a hospital billing
counselor, a social worker), each walked through Biscuit's real setup steps and heard the lines production would speak
for five held-out synthetic letters (the true facts composed by `server/compose.ts`, so every quote is a real spoken
line), then a round where each heard three others, then a report. The people were played by DeepSeek V4.1 Flash on
Fireworks; the report was meant for a Baseten model so the judge would be another family, but the Baseten key lists
models and is refused by the inference endpoint, so Fireworks wrote the report too. 237 model calls, under $0.30.

This is simulated. It cannot measure real seniors; it measures what a language model, told who these people are and
what Biscuit says, thinks they would say. It is a cheap way to hear the obvious before a real person says it. QA runs 2
and 3 on the phones remain the real test.

## Setup, per step (35 walkthroughs; confusion 0 to 3, trust 0 to 3)

| Step | n | Confusion | Trust |
|---|---|---|---|
| install on the Home Screen | 35 | 1.69 | 1.23 |
| type the six-digit code | 35 | 1.26 | 1.40 |
| consent | 35 | 0.20 | 2.09 |
| voice check | 35 | 0.57 | 2.00 |
| Help test | 35 | 1.26 | 2.00 |
| the mailbox phone on the sill | 35 | 2.23 | 1.29 |

6 of 36 stopped before the end; four of the six at the mailbox phone (no spare phone, no
wish to be watched, cannot reach the sill), two at the Home Screen install.

## A week of letters (160 reactions)

| Kind | n | Trust | Confusion | Would act |
|---|---|---|---|---|
| utility | 22 | 1.32 | 1.91 | 6 |
| other | 31 | 1.48 | 1.65 | 15 |
| bill | 42 | 1.48 | 1.95 | 21 |
| notice | 43 | 1.37 | 1.91 | 18 |
| ad | 22 | 1.77 | 0.95 | 1 |

19 of 32 seniors and children keep using it after hearing three others.

Most frequent asks (normalised, top 12):

| Ask | n |
|---|---|
| say it s an appointment reminder not just a letter | 2 |
| say it s from a debt collector not the hospital | 2 |
| say the appointment date and time out loud not just the statement date | 2 |
| say whose name is on it first not just the hospital | 2 |
| add that it can be paid online or by phone not just mail | 1 |
| also tell me the date of service and what the charge was for not just the total | 1 |
| ask before sending anything to ana | 1 |
| ask before tossing anything since i like to glance at the specials first | 1 |
| ask before you throw my mail away | 1 |
| ask if i know an agnes haddad before asking about the hospital | 1 |
| ask if i know the name agnes haddad before asking about the hospital | 1 |
| ask if i want to call or save the number | 1 |

The asks cluster: say whose name is on the letter before anything else (a dozen variants: "ask if the name matches me
before reading amounts"); say when a letter is from a debt collector and not the hospital; say that an appointment
reminder is one, with its date and time; ask before sending to Ana and before tossing; offer to call or save a phone
number; say the date of service and what a charge was for.

## The report

<!-- judge: Fireworks DeepSeek V4.1 Flash (Baseten refused the key); people: Fireworks DeepSeek V4.1 Flash; 36 personas, 5 letters each -->

# Biscuit Trial Report

Evidence base: 36 simulated people (seniors, adult children, aides, a counselor, a social worker), a setup walkthrough, a week of 5 letters each, and a round of hearing each other. 6 of 36 stopped during setup. 19 of 32 who reached the week kept using it.

---

## 1. What confuses or stops a senior in the first ten minutes and the first week

The setup has two hard walls, and they are in different places.

**The Home Screen install** is the first. Confusion 1.69, the second-highest of the six steps. The failure is not the concept, it is the vocabulary and the small targets.

> "Safari? Share? Add to Home Screen? I don't see these little words. My son in Austin did this for my phone before. I don't want to press wrong thing." — Dolores Tran

> "Now you tell me, honey—is this one of those fake ones? I don't know about this Share button. My son put a thing on my phone once and I never found it again." — Eleanor Whitcomb

**The mailbox phone on the sill** is the wall that actually stops people. Confusion 2.23, the highest of any step, and it is named in all six stop reasons. The objections are consistent: no spare phone, no second device watching the house, a cord to trip on, a phone that must stay plugged in and on one page, and a walk to the windowsill some people cannot make.

> "You want me to put the phone in the window? It's got to stay plugged in and stay on that page? I'll knock it into the sink." — Eleanor Whitcomb

> "I got stuck on the Home Screen install and can't reach the windowsill to set up the mailbox phone. I don't want to fall." — Harold Nguyen

> "The mailbox phone step is too much. I don't have a spare phone, I don't want another device watching my house, and I don't trust it to stay put or not cause trouble." — Walter "Bud" Kessler

The six-digit code (confusion 1.26) is survivable but produces a recurring paper-chase: people write the code on envelopes, bulletins, and the backs of things, then lose them. "Six digits? Where'd I put that paper... Ana, slow down, I can't hear you on this flip phone" (Eleanor Whitcomb).

Two steps land well. **Consent** is the lowest-confusion step (0.20) and the highest-trust (2.09) — the plain sentence about what Biscuit does and does not do is doing real work. **The voice check** (0.57 confusion, 2.0 trust) is also clean, and the button fallback for refused microphones is the right shape.

**The Help test is a trust problem disguised as a low-confusion step.** Confusion 1.26, trust 2.0 — but the quotes show distress, not confusion.

> "Two seconds? Red button. Now it shows Call 911? No no no. I don't want to call 911. Cancel. Cancel. My heart jumps. I don't like this test." — Dolores Tran

> "I don't want to call 911 by mistake. The phone's asking Call 911? No, no, cancel. Cancel! Did Ana get it? I hope she doesn't call me all worried." — Margaret "Maggie" Doyle

People understand the test. They do not enjoy being walked to the edge of a 911 call, and several worry about scaring Ana. The step works; the emotional cost is real and unmeasured by the numbers.

**In the first week**, the confusion shifts from setup to content. The recurring first-week complaint is not that Biscuit misreads — it is that Biscuit reads a letter as *theirs* when the name on it is someone else's. That is the single most repeated failure across all 36 diaries, and it is covered in section 4.

---

## 2. Which spoken lines they trust and which they do not, and why

**Trusted: the consent line.** "I'm Biscuit. I can read your mail out loud and tell Ana when something matters. I never call anyone myself. Is that all right?" This is the highest-trust moment in the whole trial. The reason is in the quotes: it names what it will do, names the one thing people fear most (calling someone), and asks permission. Marcus Bell: "I don't like that it can call 911, but it says it never calls anyone itself."

**Trusted: the two-reader rule, when it fires.** "The amount I read two ways, so I won't say it. Ana will check." No one in the trial complained about this line. It converts a failure into a demonstration of care. It is the clearest trust asset Biscuit has after consent.

**Trusted: quoted lines with a named sender and a date.** People repeat these back accurately in their diaries — "it's a University of Michigan financial assistance approval, $55.95 due 11/05" (Denise Okafor). When Biscuit quotes a page, the quote is believed.

**Not trusted: any line that treats a letter as the reader's before the name is checked.** This is the dominant complaint, and it is not about accuracy — it is about *attribution*. The quotes are blunt:

> "It read me a stranger's name and called it mine." — Walter Nowak

> "Biscuit read me somebody else's bill and called it mine." — Harold Pemberton

> "It should have said right off it's addressed to somebody else, not me." — repeated in more than a dozen diaries

**Not trusted: "Do you know this company?"** This question, with big buttons, is the most-rejected single line in the trial. People read it as an accusation or a quiz.

> "Don't ask me yes or no about a company I never heard of." — Verna Kowalski

> "Don't ask me yes or no like I'm supposed to know a hospital in Wisconsin." — Rufus Grady

> "Don't ask me yes or no questions like I'm supposed to chat with it." — Verna Kowalski

**Not trusted: "It looks like a bill" without the qualifier.** People who read "THIS IS NOT A BILL" on the page and heard Biscuit call it a bill lost trust immediately.

> "It should have said right away that this is not a bill and no payment is due." — Rosalind "Roz" Jefferson

> "Say plainly that this is a statement and not a bill, and that no payment is due yet." — Denise Okafor

**Not trusted: garbled times read straight.** "16:30 AM" and "11:00 PM" for a morning event were read aloud as written instead of flagged. Multiple people caught it themselves and lost confidence.

> "Should've read the times out and flagged that 16:30 AM and 11:00 PM don't make sense." — Marcus Bell

> "Don't show confusing times like 16:30 AM." — Margaret "Maggie" Doyle

**Not trusted: the offer to send to Ana, made before asking.** Even people who like Ana object to the order of operations.

> "Don't offer to send my business to Ana over a stranger's bill." — Harold Pemberton

> "It should have asked me before offering to send it to Ana." — Lorraine Baker

---

## 3. What the adult children ask for on the family page that is not there

The family page keeps sender, amount, dates, and quoted lines. The adult children want five things it does not carry.

**1. The name and address on the letter, as a field.** This is the single most requested item across the whole trial. It is not a nice-to-have; it is the thing that decides whether the letter is theirs.

> "Read me the customer name and address out loud, not just the amount." — Margaret "Maggie" Doyle

> "Mention the account number and service address so we can tell it's not Dad's." — James "Jim" Sullivan

> "Say the customer name out loud first — Clarence Fischer isn't me." — Eileen Hartnett

**2. A flag when the name or address does not match.** The children do not want to do the comparison themselves from a quote; they want Biscuit to say it.

> "It should have flagged that the name and address aren't mine." — Marcus Bell

> "Flag that it's addressed to Mabel Thompson, a different person." — Eleanor Whitcomb

**3. The account number and service address, for matching to a portal or a file.**

> "Mention the account number so I can find it in the portal." — Patricia "Pat" Nguyen

> "Read out the total charges and the account number so I can match it to her file." — Denise Okafor

**4. The action items the letter actually contains** — dispute windows, payment options, phone numbers, late fees, whether insurance was already billed.

> "Mention the 30-day dispute right and the Review in Waive financial assistance option." — Denise Okafor

> "Say whether insurance was already billed so Mom doesn't pay twice." — Denise Okafor

> "Mention the late fee and the phone/mail payment options so she knows her choices." — Patricia "Pat" Nguyen

**5. A way to see the page, not just the quote.**

> "Offer to send me the scan instead of only speaking it aloud." — Dana Whitfield

> "Offer to send a photo to my daughter Ana instead." — Maria Delgado

The family page currently answers "what did Biscuit say." The children want it to answer "is this ours, what does it cost, what do we do, and can I see it."

---

## 4. Which letter kinds Biscuit handles badly in their eyes

**Bills are the worst-handled kind, and the numbers say so.** Bills: n=42, confusion 1.95, trust 1.48, wouldAct 21. The confusion is high and the trust is mid — and the diaries show why. Bills are where the name mismatch matters most, because a bill is the one letter kind where reading it as yours can cost money.

> "It should have said the name on the bill isn't mine." — Margaret "Maggie" Doyle

> "Don't ask me to pay before I check who it belongs to." — Eleanor Whitcomb

> "It should not have asked me to confirm or pay a bill that clearly isn't mine." — Lorraine Baker

Bills also expose the "collection notice vs. hospital bill" gap. Biscuit says "bill" when the page says debt collector, and the people who catch it lose trust.

> "It didn't say it's a collections notice, not a bill." — Walter Nowak

> "Say it's a collection notice from Northstar Receivables, not just a bill from the hospital." — Marcus Bell

**Notices are the second-worst.** n=43, confusion 1.91, trust 1.37 — the lowest trust of any kind. Notices are where "THIS IS NOT A BILL" lives, and Biscuit's habit of calling them notices or bills without the qualifier is the exact failure people report.

> "It should have read the 'THIS IS NOT A BILL' line aloud." — Lorraine Baker

> "Say plainly that this is a statement and not a bill, and that no payment is due yet." — Denise Okafor

> "It should have said this is a financial assistance approval letter, not just 'a notice,' so Mom doesn't worry it's a new bill." — Denise Okafor

**Utility letters are handled badly too.** n=22, confusion 1.91, trust 1.32 — the lowest trust of any kind with a meaningful sample. The pattern is the same: a name and address from another state, read as the reader's.

> "It should have told me the name on the bill wasn't mine." — Eleanor Whitcomb

> "It should have noticed the address is in another state." — Margaret "Maggie" Doyle

**Ads are handled well.** n=22, confusion 0.95 (lowest), trust 1.77 (highest), wouldAct 1. People are not confused by ads and do not want to act on them. The only complaint is that Biscuit sometimes asks yes/no questions about junk mail instead of just saying it is junk.

> "Don't bother me with junk mail, just say 'it's an ad' and move on." — Rufus Grady

> "It didn't need to ask me to toss it — just tell me it's junk mail." — Lorraine Baker

**"Other" letters** (senior center calendars, activity flyers, appointment reminders) sit in the middle: n=31, confusion 1.65, trust 1.48. The failure here is not misattribution but omission — Biscuit says "a letter" when the page is a schedule with days and times people actually want.

> "Read the actual activities and times aloud, not just say it's a letter." — Rosalind "Roz" Jefferson

> "Could've said it's a schedule, not a bill, so I don't worry about money." — Marcus Bell

---

## 5. The three changes that would most increase use after the first week, ranked

**1. Make the mailbox phone optional, and make the phone-in-pocket path complete.**

This is the change with the largest effect, because the mailbox phone is the named cause of all six stops and the highest-confusion step (2.23). The people who stopped did not stop because Biscuit read mail badly. They stopped because the setup asked for a second device, a windowsill, a cord, and a page that must never change.

> "The mailbox phone step is too much. I don't have a spare phone... I'll stick with the phone in my pocket and the captioned telephone." — Walter "Bud" Kessler

> "I got stuck on the Home Screen install and can't reach the windowsill to set up the mailbox phone. I don't want to fall." — Harold Nguyen

> "My father doesn't have an iPhone or a spare phone... The whole thing assumes devices and skills we don't have." — Miguel Torres

A version where the older person's own phone chimes on a schedule, or where a family member triggers a read, would keep the mail-reading value and drop the step that kills adoption. The evidence supports this directly: the Help button and 911 test are called "worth it" even by people who quit over the mailbox phone (James "Jim" Sullivan).

**2. Check the name and address before reading anything else, and say the result first.**

This is the most repeated request in the entire trial — well over a hundred of the "asks" entries are variations on it. It is also the failure that most damages trust in the first week. The fix is a reordering, not a new capability: read the name and address at the top of the page, compare to the enrolled person, and lead with the answer.

> "Read me the name and address on the letter first, before any amount." — Earl Thompson

> "Say right off it's not my name or address." — Eleanor Whitcomb

> "Check the name on the letter against mine before reading it as my bill." — Eileen Hartnett

> "Don't ask me yes or no questions until I've said whether I recognize the bill." — Darnell Washington

**3. Replace "Do you know this company?" with a plain statement of what the letter is, and drop the yes/no buttons when the answer is already on the page.**

The yes/no buttons are the most-rejected interface element. People read them as a quiz or an accusation, and they fire before Biscuit has said the one thing that matters.

> "Don't put words in my mouth with yes and no buttons — just explain it to me." — Eleanor Whitcomb

> "Skip the 'Do you know this company?' buttons and ask whether this is even my mail." — Betty Chan

> "It shouldn't have offered big yes and no buttons as if the only question were whether I recognize Aurora Medical Center Kenosha." — Betty Chan

---

## What changed from it (the same night)

Shipped October 29 against the report's three changes, every test green (39 files, 174 tests), deployed to
biscuit.kindred-ai.dev.

**Change 2, the name first.** Every reader now extracts `addressee` as a cited fact, verified verbatim like the rest.
The reading opens with "This is addressed to Rosa Alvarez." When the name is not the household's (`sameName` in
`server/compose.ts`: titles dropped, initials accepted, the same last name with the same first initial accepted),
Biscuit says only "This is addressed to [the name], not to you. I'll stop here and tell Ana.", asks nothing, offers
nothing, and the letter lands on the docket as "Addressed to someone else. Ana told." with Ana's review flag set. The
button under that reading says "All right", not "Go on".

**Change 3, say what it is before any question.** The hand-off is now a question Biscuit asks ("Shall I send this to
Ana?"; for a number nobody publishes, "This asks you to call a number I don't know. Shall I tell Ana?") and it listens
for yes or no, instead of marking the letter the moment it finished speaking. Two lines the personas asked for by name:
a sender that reads like a collection agency is spoken as "This is from [the agency], about your [hospital] account."
rather than as the hospital, and a statement that says it is not a bill gets "It looks like a statement. It says this is
not a bill." before any amount. "Do you know this company?" still follows a notice that passed the name check; it is
gone from the mismatch path.

**Change 1, the mailbox phone.** Not removed: without it nothing can know the mail arrived, and the phone-in-pocket path
was already complete (Rosa taps "Mail came" on her own phone and every reading works the same). What changed is the
words. Ana's setup page now says "No spare phone, or no window on the box? Skip this. Everything else works the same",
and the skip button says so. The Help setup screen tells Rosa that for the test she taps Cancel on the phone's own
"Call 911?" dialog: nothing is called, and the test still reaches Ana.

Smaller, in the letters rather than the product: appointment times in the synthetic letters read like a clock (8:00 AM
to 4:30 PM, no more "14:30"), and the Medicare Summary Notice template no longer prints "$NaN.NaN". Both are in the
generator the next training round draws from, and every synthetic truth now carries the addressee.

Not changed, and why. A chime on Rosa's own phone at the usual delivery hour, for a household with no mailbox phone, is
the next step for change 1 and is on the roadmap, not in this week. The yes/no buttons stay as the fallback for people
in buttons mode and for a reading that passed the name check. Baseten's key is still refused by its inference endpoint,
so a second family of judge remains undone.
