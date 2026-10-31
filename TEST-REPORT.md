# Test report

Date: 2026-10-31

## Commands

From the repo root, after `cd test && npm ci && npx playwright install chromium`:

```bash
python3 -m http.server 4173
BASE=http://127.0.0.1:4173/ node test/run.js
node test/pages-smoke.js http://127.0.0.1:4173/
```

## Result

`run.js`: **233 passed, 0 failed** (222 existing checks + 11 offline checks). Exit code 0.

`pages-smoke.js`: **passed** (`ok: true`). Exit code 0.

## run.js

```
PASS frames [The idea is about a girl, a locked door and a journal]: main-flow questions have no ellipsis
PASS frames [The idea is about a girl, a locked door and a journal]: main-flow questions are all different
PASS frames [The idea is about a girl, a locked door and a journal]: Don's Twist view has 7 distinct rows :: Suppose Kim isn’t the first to find the locked door. Who was? | What secret could Kim be keeping, even from herself? | Could the secrets she’s chasing turn out to be about her? | What if the locked door was never meant to keep her out? | Is what Kim fears losing the very thing holding her back? | Was the journal meant for Kim all along? | What has this world been hiding on purpose?
PASS frames [The idea is about a girl, a locked door and a journal]: no shared sentence frame in any of the 7 views
PASS frames [The idea is about a girl, a locked door and a journal]: no "…" or "..." in any reframe
PASS frames [A girl finds a locked door in her school.]: main-flow questions have no ellipsis
PASS frames [A girl finds a locked door in her school.]: main-flow questions are all different
PASS frames [A girl finds a locked door in her school.]: Don's Twist view has 7 distinct rows :: Suppose Kim isn’t the first to find the locked door. Who was? | What secret could Kim be keeping, even from herself? | Could the secrets she’s chasing turn out to be about her? | What if the locked door was never meant to keep her out? | Is what Kim fears losing the very thing holding her back? | Was the journal meant for Kim all along? | What has the school been hiding on purpose?
PASS frames [A girl finds a locked door in her school.]: no shared sentence frame in any of the 7 views
PASS frames [A girl finds a locked door in her school.]: no "…" or "..." in any reframe
PASS frames [A lonely robot discovers a flower on Mars]: main-flow questions have no ellipsis
PASS frames [A lonely robot discovers a flower on Mars]: main-flow questions are all different
PASS frames [A lonely robot discovers a flower on Mars]: no shared sentence frame in any of the 7 views
PASS frames [A lonely robot discovers a flower on Mars]: no "…" or "..." in any reframe
PASS frames [Why do volcanoes erupt?]: main-flow questions have no ellipsis
PASS frames [Why do volcanoes erupt?]: main-flow questions are all different
PASS frames [Why do volcanoes erupt?]: no shared sentence frame in any of the 7 views
PASS frames [Why do volcanoes erupt?]: no "…" or "..." in any reframe
PASS frames [Grade 4 — ecosystems]: main-flow questions have no ellipsis
PASS frames [Grade 4 — ecosystems]: main-flow questions are all different
PASS frames [Grade 4 — ecosystems]: no shared sentence frame in any of the 7 views
PASS frames [Grade 4 — ecosystems]: no "…" or "..." in any reframe
PASS frames [I keep putting off my homework]: main-flow questions have no ellipsis
PASS frames [I keep putting off my homework]: main-flow questions are all different
PASS frames [I keep putting off my homework]: no shared sentence frame in any of the 7 views
PASS frames [I keep putting off my homework]: no "…" or "..." in any reframe
PASS frames [a dragon who is afraid of fire]: main-flow questions have no ellipsis
PASS frames [a dragon who is afraid of fire]: main-flow questions are all different
PASS frames [a dragon who is afraid of fire]: no shared sentence frame in any of the 7 views
PASS frames [a dragon who is afraid of fire]: no "…" or "..." in any reframe
PASS tidy: sentence-cases and drops filler/stray caps :: That the journal may belong to someone else
PASS A-story-desktop: opening minimal (1 input, 1 submit)
PASS A-story-desktop: no "Welcome to STORIGEN OS"
PASS A-story-desktop: seven lenses around idea
PASS A-story-desktop: one question shown :: Who is she?
PASS A-story-desktop: "Look what you already know." after 3 answers
   questions: ["Who is she?","Why does Maya need the door opened?","What stops Maya?","KNOW","What happens if Maya walks away?","What might Maya misunderstand?","What rules does this school have?","What changes what Maya thinks she knows?"]
PASS A-story-desktop: story reveal opens after the lenses
PASS A-story-desktop: reveal title "Your story, in your words"
PASS A-story-desktop: every answer (7) appears in full in the spine
PASS A-story-desktop: scaffold invents no nouns
PASS A-story-desktop: logline built from the learner's words
PASS A-story-desktop: closing line credits the learner
PASS A-story-desktop: reveal has no sideways scroll :: {"missing":[],"fw":" has one goal:  ,  but   stands in the way . the world:  . it begins  when  . meet  . she  has one goal:  . but   stands in the way . if she walks away,  . what she doesn’t realize:  . and the twist:  .","title":"Your story, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":3,"ow":0,"docOw":0}
PASS A-story-desktop: "See what you built" button on the map
PASS A-story-desktop: map has answered nodes :: 7 nodes
PASS A-story-desktop: map links grew :: 7 arcs
PASS A-story-desktop: perspective re-centers map
PASS A-story-desktop: nodes reframed in perspective view :: 6 reframed
PASS A-story-desktop: perspective node at center
PASS A-story-desktop: footer principle visible
PASS A-story-desktop: no overlapping/offscreen nodes (perspective view) :: {"n":0,"off":0}
PASS A-story-desktop: no overlapping nodes (idea view) :: 0
PASS A-story-desktop: no JS errors
PASS B-question-desktop: opening minimal (1 input, 1 submit)
PASS B-question-desktop: no "Welcome to STORIGEN OS"
PASS B-question-desktop: seven lenses around idea
PASS B-question-desktop: one question shown :: Who or what is at the center of volcanoes?
PASS B-question-desktop: "Look what you already know." after 3 answers
   questions: ["Who or what is at the center of volcanoes?","What is magma trying to do?","What stops magma?","KNOW","What happens if it goes wrong?","Who might see volcanoes completely differently?","Where does this happen, and what are the rules there?","What if one thing changed? What would it be?"]
PASS B-question-desktop: story reveal opens after the lenses
PASS B-question-desktop: reveal title "Your thinking, in your words"
PASS B-question-desktop: every answer (6) appears in full in the spine
PASS B-question-desktop: scaffold invents no nouns
PASS B-question-desktop: logline built from the learner's words
PASS B-question-desktop: closing line credits the learner
PASS B-question-desktop: reveal has no sideways scroll :: {"missing":[],"fw":"you asked   and found what’s in the way:  . the question:  who’s involved:  what they’re trying to do:  where it happens:  what’s in the way:  another angle:  what could change: ","title":"Your thinking, in your words","nAnswers":6,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":2,"ow":0,"docOw":0}
PASS B-question-desktop: "See what you built" button on the map
PASS B-question-desktop: map has answered nodes :: 6 nodes
PASS B-question-desktop: map links grew :: 5 arcs
PASS B-question-desktop: perspective re-centers map
PASS B-question-desktop: nodes reframed in perspective view :: 5 reframed
PASS B-question-desktop: perspective node at center
PASS B-question-desktop: footer principle visible
PASS B-question-desktop: no overlapping/offscreen nodes (perspective view) :: {"n":0,"off":0}
PASS B-question-desktop: no overlapping nodes (idea view) :: 0
PASS B-question-desktop: no JS errors
PASS C-robot-mobile: opening minimal (1 input, 1 submit)
PASS C-robot-mobile: no "Welcome to STORIGEN OS"
PASS C-robot-mobile: seven lenses around idea
PASS C-robot-mobile: one question shown :: Who is the lonely robot?
PASS C-robot-mobile: "Look what you already know." after 3 answers
   questions: ["Who is the lonely robot?","Why does the flower matter to Rivet?","What stops Rivet?","KNOW","What happens if Rivet walks away from the flower?","What might Rivet misunderstand?","What rules does Mars have?","What changes what Rivet thinks they know?"]
PASS C-robot-mobile: story reveal opens after the lenses
PASS C-robot-mobile: reveal title "Your story, in your words"
PASS C-robot-mobile: every answer (7) appears in full in the spine
PASS C-robot-mobile: scaffold invents no nouns
PASS C-robot-mobile: logline built from the learner's words
PASS C-robot-mobile: closing line credits the learner
PASS C-robot-mobile: reveal has no sideways scroll :: {"missing":[],"fw":" has one goal:  ,  but  . the world:  . it begins  when  . meet  . they  have one goal:  . but  . if they walk away,  . what they don’t realize:  . and the twist:  .","title":"Your story, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":3,"ow":0,"docOw":0}
PASS C-robot-mobile: "See what you built" button on the map
PASS C-robot-mobile: map has answered nodes :: 7 nodes
PASS C-robot-mobile: map links grew :: 7 arcs
PASS C-robot-mobile: perspective re-centers map
PASS C-robot-mobile: nodes reframed in perspective view :: 6 reframed
PASS C-robot-mobile: perspective node at center
PASS C-robot-mobile: footer principle visible
PASS C-robot-mobile: no overlapping/offscreen nodes (perspective view) :: {"n":0,"off":0}
PASS C-robot-mobile: no overlapping nodes (idea view) :: 0
PASS C-robot-mobile: no JS errors
PASS D-teacher-desktop: opening minimal (1 input, 1 submit)
PASS D-teacher-desktop: no "Welcome to STORIGEN OS"
PASS D-teacher-desktop: seven lenses around idea
PASS D-teacher-desktop: one question shown :: Who are the “characters” in ecosystems?
PASS D-teacher-desktop: "Look what you already know." after 3 answers
   questions: ["Who are the “characters” in ecosystems?","What are organisms trying to do?","What stands in the way of organisms?","KNOW","What’s at stake if organisms fail?","Whose point of view could students take?","What is the “world” of ecosystems?","What one change could students test?"]
PASS D-teacher-desktop: story reveal opens after the lenses
PASS D-teacher-desktop: reveal title "Your learning experience"
PASS D-teacher-desktop: every answer (7) appears in full in the spine
PASS D-teacher-desktop: scaffold invents no nouns
PASS D-teacher-desktop: logline built from the learner's words
PASS D-teacher-desktop: closing line credits the learner
PASS D-teacher-desktop: reveal has no sideways scroll :: {"missing":[],"fw":"grade 4 students investigate   through  , and work out what’s in the way:  . 1. open the world ·  students explore  . ask: “what are the rules here?” 2. meet the characters ·  students identify and sort  . ask: “who lives in this world?” 3. name the goal ·  ask: “what are   trying to do?” students defend their answer. target idea:  . 4. find the obstacle ·  students list what makes it hard:  . ask: “which obstacle matters most? why?” 5. weigh the stakes ·  students predict what happens if   fail:  . 6. switch perspective ·  small groups each take one view ( ) and explain the same event from it. 7. introduce the twist ·  change one thing:  . students revise their map and explain what changed and why. exit ticket: “which lens helped you understand   most, and what evidence shows it?”","title":"Your learning experience","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":3,"ow":0,"docOw":0}
PASS D-teacher-desktop: "See your learning experience" button on the map
PASS D-teacher-desktop: map has answered nodes :: 7 nodes
PASS D-teacher-desktop: map links grew :: 7 arcs
PASS D-teacher-desktop: perspective re-centers map
PASS D-teacher-desktop: nodes reframed in perspective view :: 6 reframed
PASS D-teacher-desktop: perspective node at center
PASS D-teacher-desktop: footer principle visible
PASS D-teacher-desktop: no overlapping/offscreen nodes (perspective view) :: {"n":0,"off":0}
PASS D-teacher-desktop: teacher "Turn this into a learning experience"
PASS D-teacher-desktop: plan has 7 steps
PASS D-teacher-desktop: no overlapping nodes (idea view) :: 0
PASS D-teacher-desktop: no JS errors
PASS E-problem-tablet: opening minimal (1 input, 1 submit)
PASS E-problem-tablet: no "Welcome to STORIGEN OS"
PASS E-problem-tablet: seven lenses around idea
PASS E-problem-tablet: one question shown :: Who’s part of this, besides you?
PASS E-problem-tablet: "Look what you already know." after 3 answers
   questions: ["Who’s part of this, besides you?","What would “solved” look like?","What gets in the way most?","KNOW","What happens if nothing changes?","How might someone else see this?","When and where does it usually happen?","What if the real problem is something else?"]
PASS E-problem-tablet: story reveal opens after the lenses
PASS E-problem-tablet: reveal title "Your thinking, in your words"
PASS E-problem-tablet: every answer (7) appears in full in the spine
PASS E-problem-tablet: scaffold invents no nouns
PASS E-problem-tablet: logline built from the learner's words
PASS E-problem-tablet: closing line credits the learner
PASS E-problem-tablet: reveal has no sideways scroll :: {"missing":[],"fw":"you started with   and found what’s in the way:  . the problem:  who’s involved:  what “solved” looks like:  when and where:  what’s in the way:  why it matters:  another angle:  what could change: ","title":"Your thinking, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":2,"ow":0,"docOw":0}
PASS E-problem-tablet: "See what you built" button on the map
PASS E-problem-tablet: map has answered nodes :: 7 nodes
PASS E-problem-tablet: map links grew :: 7 arcs
PASS E-problem-tablet: perspective re-centers map
PASS E-problem-tablet: nodes reframed in perspective view :: 6 reframed
PASS E-problem-tablet: perspective node at center
PASS E-problem-tablet: footer principle visible
PASS E-problem-tablet: no overlapping/offscreen nodes (perspective view) :: {"n":0,"off":0}
PASS E-problem-tablet: no overlapping nodes (idea view) :: 0
PASS E-problem-tablet: no JS errors
PASS don desktop: "See what you built" appears after 5 answers
PASS G-don-desktop: story reveal opens after the lenses
PASS G-don-desktop: reveal title "Your story, in your words"
PASS G-don-desktop: every answer (7) appears in full in the spine
PASS G-don-desktop: scaffold invents no nouns
PASS G-don-desktop: logline built from the learner's words
PASS G-don-desktop: closing line credits the learner
PASS G-don-desktop: reveal has no sideways scroll :: {"missing":[],"fw":"in a world where  ,   wants  ,  but  . in a world where  , it begins  with  . meet  . she  wants  . but  . if she walks away,  . what she doesn’t realize:  . and the twist:  .","title":"Your story, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":4,"ow":0,"docOw":0}
   logline: In a world where everything is watched, Kim wants holes very important secrets, but it is locked and she does not have the key.
PASS don desktop: logline is Don's words
PASS don desktop: spine includes "Kim"
PASS don desktop: spine includes "holes very important secrets"
PASS don desktop: spine includes "it is locked and she does not have the key"
PASS don desktop: spine includes "she loses her only chance"
PASS don desktop: spine includes "that the journal may belong to someone else"
PASS don desktop: spine includes "everything is watched"
PASS don desktop: spine includes "she has been the key the whole time"
PASS don desktop: three acts BEGINNING / MIDDLE / TURN
PASS don desktop: connection links the locked door and the journal (as a question) :: Your obstacle (the locked door) and your perspective (the journal) point at the same secret. Is the locked door hiding the journal’s real owner?
PASS don desktop: connection links obstacle key and twist key
PASS don desktop: tension names the big stakes vs the fuzzy goal
PASS don desktop: every insight is phrased as a question or a gap :: Your obstacle (the locked door) and your perspective (the journal) point at the same secret. Is the locked door hiding the journal’s real owner? | Your obstacle says she doesn’t have the key. Your twist says she has been the key all along. What does Kim have to see to know it? | In a world where everything is watched, how does Kim keep the secrets hidden? | Your stakes are big (“she loses her only chance”), but Kim’s goal is still fuzzy (“holes very important secrets”). What would make her risk everything for it? | You named Kim, but we don’t know who she is yet. One word about her would make the beginning stronger.
PASS don desktop: 2-3 tappable next moves :: 3
PASS don desktop: story strength shown per act :: 50,82,75
PASS don desktop: live update adds new highlighted phrases :: they could free her brother | when she reads her own name in it
PASS don desktop: new phrase lands in MIDDLE and TURN
PASS don desktop: story strength brightens as answers deepen :: 50,82,75 -> 50,100,100
PASS don desktop: answered moves are replaced by new ones
PASS write first line: seeded by a prompt only :: Start where Kim first sees the locked door.
PASS write first line: add disabled until text
PASS write first line: learner text appended, highlighted
PASS write first line: button becomes "Edit my first line"
PASS print: button calls window.print()
PASS print: map and spine both render, buttons hidden, white page :: {"map":8,"rv":"static","btns":true,"bg":"rgb(255, 255, 255)"}
PASS "See it through another lens" closes reveal into perspective view
PASS "See what you built" reopens the story, extras kept
PASS Escape closes the story
PASS "Start a new idea" returns to the opening
PASS sound: reveal cue played
PASS don desktop: no JS errors
PASS sound: toggle visible and labelled
PASS sound: OFF by default
PASS sound: click turns it on (aria-pressed + localStorage)
PASS sound: choice remembered after reload
PASS mobile: question panel fits without scrolling :: {"sh":398,"ch":398}
PASS G-don-phone: story reveal opens after the lenses
PASS G-don-phone: reveal title "Your story, in your words"
PASS G-don-phone: every answer (7) appears in full in the spine
PASS G-don-phone: scaffold invents no nouns
PASS G-don-phone: logline built from the learner's words
PASS G-don-phone: closing line credits the learner
PASS G-don-phone: reveal has no sideways scroll :: {"missing":[],"fw":"in a world where  ,   wants  ,  but  . in a world where  , it begins  with  . meet  . she  wants  . but  . if she walks away,  . what she doesn’t realize:  . and the twist:  .","title":"Your story, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":4,"ow":0,"docOw":0}
PASS don phone: next-move answer slots into the spine
PASS don phone: reveal layout has no overflow :: {"ow":0,"wide":0}
PASS don phone: "See what you built" stays on the map
PASS don: map nodes show full answers (no '…') :: YOUR IDEA The idea is about a girl, a locked door and a journal CHARACTER Kim GOAL Holes very important secrets OBSTACLE It is locked and she does not have the 
PASS don: no clipped answer text on nodes :: 0
PASS don: perspective view - 7 rows, no shared frame :: Whose story is this, if Kim isn’t the one telling it? | How would Kim’s best friend describe her right now? | Who would want Kim to fail, and why? | Who locked the door, and what were they protecting? | Who else gets hurt if Kim fails? | What does this world look like to someone who doesn’t belong there? | Who already knew the truth before Kim did?
PASS don: perspective view - no '…' or '...'
PASS don: world view - 7 rows, no shared frame :: Could this story happen anywhere else, or only here? | What does this world expect Kim to be? | What rule in this world makes her goal hard to reach? | Is the obstacle part of this world itself? | Who in this world would notice if things go wrong? | Where in this world would someone see this completely differently? | What would this world have to hide for this twist to work?
PASS don: world view - no '…' or '...'
PASS don: twist view - 7 rows, no shared frame :: Suppose Kim isn’t the first to find the locked door. Who was? | What secret could Kim be keeping, even from herself? | Could the secrets she’s chasing turn out to be about her? | What if the locked door was never meant to keep her out? | Is what Kim fears losing the very thing holding her back? | Was the journal meant for Kim all along? | What has this world been hiding on purpose?
PASS don: twist view - no '…' or '...'
PASS don: twist view shows Don's full answers :: You said: Kim | You said: Holes very important secrets | You said: It is locked and she does not have the key | You said: She loses her only chance | You said: That the journal may belong to someone else | You said: Everything is watched
PASS don: twist rows do not use the old robotic template
PASS don: character view - 7 rows, no shared frame :: Who does this story really belong to? | What does wanting this say about who Kim is? | What does this obstacle reveal about Kim? | Why does Kim care so much? | How does the other side change how Kim sees herself? | How did this world make Kim who she is? | Who is Kim after the twist?
PASS don: character view - no '…' or '...'
PASS don: goal view - 7 rows, no shared frame :: What is this story really reaching for? | What does Kim want that she won’t say out loud? | Does the obstacle change what Kim really wants? | Is the goal worth the risk? | Does the other side want the same thing? | What does this world reward people for wanting? | After the twist, does Kim still want the same thing?
PASS don: goal view - no '…' or '...'
PASS don: obstacle view - 7 rows, no shared frame :: What’s the hardest part of this story to solve? | How could Kim be her own obstacle? | What will Kim have to give up to get there? | What makes Kim want to give up? | What if the obstacle looks like help from the other side? | What in this world works against Kim? | What new problem does the twist create?
PASS don: obstacle view - no '…' or '...'
PASS don: stakes view - 7 rows, no shared frame :: Why does this story need to be told now? | What would Kim never forgive herself for? | What happens to Kim if she never gets the secrets? | What will Kim risk to get past it? | Who pays the price if nobody listens to the other side? | What could this world lose because of this? | When the truth comes out, who has the most to lose?
PASS don: stakes view - no '…' or '...'
PASS don: all 7 lens views visited :: perspective,world,twist,character,goal,obstacle,stakes
PASS sound ON: chime, land, swell and whoosh cues all played :: chime,land,swell,reveal,whoosh
PASS sound ON: reveal cue played for the story
PASS sound OFF: no cues play once muted
PASS sound: muted choice saved
PASS links: no arc label sits on top of a node :: 0
PASS don + sound: no JS errors (muted and unmuted)
PASS offline: service worker controls the page
PASS offline: app renders after reload
PASS offline: seven lenses around the idea
PASS offline: story reveal opens after the lenses
PASS offline: reveal title "Your story, in your words"
PASS offline: every answer (7) appears in full in the spine
PASS offline: scaffold invents no nouns
PASS offline: logline built from the learner's words
PASS offline: closing line credits the learner
PASS offline: reveal has no sideways scroll :: {"missing":[],"fw":" has one goal:  ,  but   stands in the way . the world:  . it begins  when  . meet  . she  has one goal:  . but   stands in the way . if she walks away,  . what she doesn’t realize:  . and the twist:  .","title":"Your story, in your words","nAnswers":7,"closing":"Every underlined word came from you. STORIGEN only asked.","logMarks":3,"ow":0,"docOw":0}
PASS offline: no JS errors

233/233 checks passed
```

## pages-smoke.js

```
{
 "BASE": "http://127.0.0.1:4173/",
 "ok": true,
 "engine": true,
 "fontsLoaded": 3,
 "failedRequests": [],
 "errors": [],
 "logline": "In a world where everything is watched, Kim wants holes very important secrets, but it is locked and she does not have the key.",
 "insights": 5
}
```
