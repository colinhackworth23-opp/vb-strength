// VB Strength — built-in program (weeks, exercise groups).
// The Program tab in the Google Sheet overrides the exercise groups once it exists.

// Which training block new log rows belong to (written to the Sets tab's Block column)
const PROGRAM_BLOCK = 'fall-2026-b1';

// ── Data ──
const WEEKS = [
  { n:1, phase:'Foundation', dates:'Sep 28 – Oct 4', intensity:'65% TM', volume:'4×10', rpe:'6', reps:10,
    pcts:{ squat:[0.65,0.65,0.65,0.65], bench:[0.65,0.65,0.65,0.65], dl:[0.65,0.65,0.65] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false },
  { n:2, phase:'Foundation', dates:'Oct 5 – Oct 11', intensity:'67% TM', volume:'4×10', rpe:'6–7', reps:10,
    pcts:{ squat:[0.67,0.67,0.67,0.67], bench:[0.67,0.67,0.67,0.67], dl:[0.67,0.67,0.67] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false },
  { n:3, phase:'Build', dates:'Oct 12 – Oct 18', intensity:'70–75% TM', volume:'4×8', rpe:'7', reps:8,
    pcts:{ squat:[0.70,0.72,0.74,0.75], bench:[0.70,0.72,0.74,0.75], dl:[0.70,0.72,0.74] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false, checkin:3 },
  { n:4, phase:'Build', dates:'Oct 19 – Oct 25', intensity:'72–77% TM', volume:'4×8', rpe:'7–8', reps:8,
    pcts:{ squat:[0.72,0.74,0.76,0.77], bench:[0.72,0.74,0.76,0.77], dl:[0.72,0.74,0.76] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false },
  { n:5, phase:'Build', dates:'Oct 26 – Nov 1', intensity:'74–79% TM', volume:'4×8', rpe:'8', reps:8,
    pcts:{ squat:[0.74,0.76,0.78,0.79], bench:[0.74,0.76,0.78,0.79], dl:[0.74,0.76,0.78] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false, checkin:5 },
  { n:6, phase:'Intensify', dates:'Nov 2 – Nov 8', intensity:'76–82% TM', volume:'4×6', rpe:'8', reps:6,
    pcts:{ squat:[0.76,0.78,0.80,0.82], bench:[0.76,0.78,0.80,0.82], dl:[0.76,0.78,0.80] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false },
  { n:7, phase:'Intensify', dates:'Nov 9 – Nov 15', intensity:'78–84% TM', volume:'4×6', rpe:'8–9', reps:6,
    pcts:{ squat:[0.78,0.80,0.82,0.84], bench:[0.78,0.80,0.82,0.84], dl:[0.78,0.80,0.82] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false },
  { n:8, phase:'Peak volume', dates:'Nov 16 – Nov 22', intensity:'78–84% TM', volume:'4×6', rpe:'8–9', reps:6,
    pcts:{ squat:[0.78,0.80,0.82,0.84], bench:[0.78,0.80,0.82,0.84], dl:[0.78,0.80,0.82] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false, checkin:8 },
  { n:9, phase:'Peak volume', dates:'Nov 23 – Nov 29', intensity:'80–86% TM', volume:'4×6', rpe:'9', reps:6,
    pcts:{ squat:[0.80,0.82,0.84,0.86], bench:[0.80,0.82,0.84,0.86], dl:[0.80,0.82,0.84] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', done:false, thanksgiving:true },
  { n:10, phase:'Deload', dates:'Nov 30 – Dec 6', intensity:'55–65% TM', volume:'3×5', rpe:'5', reps:5,
    pcts:{ squat:[0.55,0.60,0.65], bench:[0.55,0.60,0.65], dl:[0.55,0.60,0.65] },
    days:['lower','home-lower','push-pull','home-upper','power','prehab','off'], lastLiftSlot:'power', deload:true, done:false },
];

const ACC = {
  warmupGeneral: [
    { rest:0, name:'Bike or stairs — easy', meta:'3 min', rec:'raise temperature', cue:'Same every single day so you can stop looking at your phone. Easy pace, just enough to break a light sweat. The point is warm tissue and blood flow, not fatigue.', sets:['3 min'] },
    { rest:0, name:'World greatest stretch', meta:'5 ea side', rec:'full body opener', cue:'Lunge, elbow to instep, then rotate and reach to the ceiling. Hits hips, hamstrings, thoracic spine and shoulders in one movement. The most efficient 90 seconds in any warm-up.', sets:['5 ea'] },
    { rest:0, name:'Cat-cow into thoracic rotation', meta:'8 ea', rec:'spine prep', cue:'Eight cat-cows, then eight open-book rotations per side. At 6ft10 your thoracic spine takes a beating from sitting and driving — this is the reset before you load it.', sets:['8 ea'] },
    { rest:0, name:'Band pull-apart', meta:'15 reps', rec:'shoulder activation', cue:'Light band, arms straight, squeeze the blades. Wakes up the rear delts and scapular muscles before anything heavy. Same every day.', sets:['15'] },
  ],
  primerLower: [
    { rest:0, name:'Spanish squat hold', meta:'2 × 45s', rec:'knee prep — do not skip', cue:'Band around a post at knee height, sit back, shins vertical. Heavy isometrics often take the edge off patellar tendon pain for a while afterward, which is exactly the window when your knee complains.', sets:['45s','45s'] },
    { rest:0, name:'Ankle rock (knee to wall)', meta:'10 ea side', rec:'squat depth', cue:'Knee tracks forward over the toes, heel stays down. Limited ankle dorsiflexion is the most common reason a tall lifter loses depth or pitches forward. Ninety seconds well spent.', sets:['10 ea'] },
    { rest:0, name:'Banded lateral walk', meta:'10 ea way', rec:'glute med activation', cue:'Band above the knees, small steps, stay low. Wakes up the glute medius so your knees do not cave under load later.', sets:['10 ea'] },
    { rest:0, name:'Bodyweight squat', meta:'10 reps', rec:'pattern rehearsal', cue:'Slow, full depth, pause at the bottom. Rehearse the exact pattern you are about to load.', sets:['10'] },
  ],
  primerPushPull: [
    { rest:0, name:'Wall slide', meta:'10 reps', rec:'scapular upward rotation', cue:'Back and arms flat to the wall, slide up and reach long at the top. Primes the shoulder blade mechanics that every press and pull today depends on.', sets:['10'] },
    { rest:0, name:'Band external rotation — light', meta:'15 ea side', rec:'cuff wake-up', cue:'Light band, elbow pinned, slow. This is a primer dose, not the training dose — the loaded version comes later in the session.', sets:['15 ea'] },
    { rest:0, name:'Dead hang', meta:'30s', rec:'decompress + grip prep', cue:'Relaxed hang before you pull anything. Decompresses the shoulders and gets the grip ready for pull-up work.', sets:['30s'] },
    { rest:0, name:'Push-up', meta:'10 reps', rec:'pressing rehearsal', cue:'Slow and controlled, full range. Warms the pressing pattern and the serratus before the bench comes out.', sets:['10'] },
  ],
  primerPower: [
    { rest:0, name:'Spanish squat hold', meta:'2 × 45s', rec:'knee prep before cleans', cue:'Same hold as Monday. Quiets the knee before the most explosive session of the week.', sets:['45s','45s'] },
    { rest:0, name:'Leg swings — front and side', meta:'10 ea direction', rec:'dynamic hip prep', cue:'Controlled swings, front to back then side to side. Dynamic range for the hips before explosive hip extension.', sets:['10 ea'] },
    { rest:0, name:'Front rack + wrist stretch', meta:'30s ea', rec:'rack position', cue:'Elbows up, gentle pressure into the rack position, then wrist circles. Your rack position is the limiting factor on cleans and front squats at your height — prepare it deliberately.', sets:['30s','30s'] },
    { rest:0, name:'Empty bar clean pull', meta:'2 × 5', rec:'pattern rehearsal', cue:'Empty bar from the hang. Rehearse hip drive, shrug and high pull before you add any weight. Speed even here.', sets:['5','5'] },
  ],
  cooldownLower: [
    { rest:0, name:'Couch stretch', meta:'45s ea side', rec:'hip flexor + quad', cue:'Rear foot elevated against a wall or bench, squeeze the glute of the back leg. Squats and leg press shorten the hip flexors — this unwinds them.', sets:['45s','45s'] },
    { rest:0, name:'Standing hamstring stretch', meta:'45s ea side', rec:'posterior chain', cue:'Heel on a bench, hinge from the hip with a flat back. After RDLs and Nordics your hamstrings have earned this.', sets:['45s','45s'] },
    { rest:0, name:'Calf wall stretch', meta:'45s ea side', rec:'straight and bent knee', cue:'Do 45 seconds with the knee straight for the gastroc, then 45 with it bent for the soleus. Both get hammered by your calf volume.', sets:['45s','45s'] },
    { rest:0, name:'Hip 90/90', meta:'8 ea side', rec:'hip rotation', cue:'Slow switches between internal and external rotation. Feeds landing mechanics and knee health.', sets:['8 ea'] },
  ],
  cooldownPushPull: [
    { rest:0, name:'Doorway pec stretch', meta:'45s ea side', rec:'chest opener', cue:'Forearm on the frame at shoulder height, step through gently. Counteracts the bench and dip volume and pulls your shoulders back out of a rounded position.', sets:['45s','45s'] },
    { rest:0, name:'Child pose lat stretch', meta:'45s ea side', rec:'lat lengthening', cue:'Hands on a bench, sink the hips back and reach long to one side. Long lats need this after a heavy pulling day.', sets:['45s','45s'] },
    { rest:0, name:'Sleeper stretch', meta:'30s ea side', rec:'internal rotation', cue:'Side-lying, gently rotate the forearm down. Gentle — this should never be painful. Helps the internal rotation range that overhead athletes lose.', sets:['30s','30s'] },
    { rest:0, name:'Thoracic extension over a roller', meta:'60s', rec:'upper back', cue:'Roller across the mid-back, extend over it slowly. Undoes the forward posture that a pressing day encourages.', sets:['60s'] },
  ],
  cooldownPower: [
    { rest:0, name:'Couch stretch', meta:'45s ea side', rec:'hip flexor', cue:'After cleans and front squats the hip flexors are shortened and angry. Squeeze the glute on the back leg.', sets:['45s','45s'] },
    { rest:0, name:'Front rack + wrist stretch', meta:'30s ea', rec:'undo the rack position', cue:'Gentle wrist extension and flexion, then the rack stretch again. Your wrists took the clean catches today.', sets:['30s','30s'] },
    { rest:0, name:'Standing hamstring stretch', meta:'45s ea side', rec:'after the hex bar', cue:'Heel elevated, flat back, hinge. Your hamstrings did hex bar pulls and hip thrusts today.', sets:['45s','45s'] },
    { rest:0, name:'Thoracic extension over a roller', meta:'60s', rec:'upper back reset', cue:'Slow extensions over the roller. Finishes the week well.', sets:['60s'] },
  ],
  cooldownHomeUpper: [
    { rest:0, name:'Doorway pec stretch', meta:'45s ea side', rec:'chest opener', cue:'Forearm on the door frame, step through gently. Thirty seconds of work, real payoff for posture.', sets:['45s','45s'] },
    { rest:0, name:'Overhead triceps stretch', meta:'30s ea side', rec:'after the extensions', cue:'Elbow behind your head, gentle pull. Straight after the overhead work.', sets:['30s','30s'] },
    { rest:0, name:'Dead hang', meta:'30s', rec:'decompression', cue:'One relaxed hang to finish. Decompresses everything you just loaded.', sets:['30s'] },
  ],
  cooldownHomeLower: [
    { rest:0, name:'Couch stretch', meta:'45s ea side', rec:'hip flexor', cue:'Rear foot on the couch you did not put your Bulgarian foot on. Squeeze the back glute.', sets:['45s','45s'] },
    { rest:0, name:'Calf wall stretch', meta:'45s ea side', rec:'straight and bent knee', cue:'Straight knee then bent knee. Your calves get four doses a week — give them this.', sets:['45s','45s'] },
    { rest:0, name:'Hip 90/90', meta:'8 ea side', rec:'hip rotation', cue:'Slow switches, breathe. Good one to finish on before bed.', sets:['8 ea'] },
  ],
  conditioning: [
    { rest:0, name:'Interval finisher — 20s hard / 100s easy', meta:'6-8 rounds', rec:'bike, stairs or assault runner', cue:'LAST thing in the session, never before lifting. Twenty seconds genuinely hard, then 100 seconds easy spinning — the long recovery is the point. This trains your ability to recover BETWEEN efforts, which is exactly what a long tournament demands and what failed you in the finals. Skip it entirely if you are playing tomorrow. Not the ski-erg while the shoulder is still the project.', sets:{3:['6 rounds'],4:['6 rounds'],5:['6 rounds'],6:['7 rounds'],7:['7 rounds'],8:['7 rounds'],9:['8 rounds'],10:['8 rounds']} },
  ],
  lower: [
    { inc:10, name:'Romanian deadlift (barbell)', meta:'3 × 10', rec:'straps on heavy sets', cue:'Hips back, neutral spine, 3s eccentric. Your grip fails before your posterior chain does — use straps on the top set so the hamstrings get the honest stimulus. Weight only moves when you tap Clean.', sets:{1:['135','145','155'],2:['135','145','155'],3:['135','145','155'],4:['135','145','155'],5:['135','145','155'],6:['135','145','155'],7:['135','145','155'],8:['135','145','155'],9:['135','145','155'],10:['115','125','135']} },
    { inc:10, ss:'A', name:'Leg press', meta:'3 × 12', rec:'ADDED weight — sled starts at 167', cue:'Numbers here are plates ADDED, not total. Your sled weighs 167 empty, so 180 added is about 347 total. Feet shoulder-width, toes slightly out, full range, knees tracking over the toes and never caving. Pure quad work with zero load on your lower back — this is the structural knee work that makes jumping cheaper. Remember this comes third, after squats and RDLs, and both of those get heavier as the block goes on — so a top set that feels easy in Week 1 will not feel easy in Week 6.', sets:{1:['140','160','180'],2:['140','160','180'],3:['140','160','180'],4:['140','160','180'],5:['140','160','180'],6:['140','160','180'],7:['140','160','180'],8:['140','160','180'],9:['140','160','180'],10:['90','115','115']} },
    { ss:'A', name:'Nordic curl (slow eccentric)', meta:'3 × 5', rec:'BW — 4s down', cue:'Superset with leg press: alternate, minimal rest. Lower as slowly as you can — 4 full seconds. Hamstring eccentric strength is your best landing-injury insurance.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { inc:10, name:'Standing calf raise (barbell)', meta:'4 × 12', rec:'3s eccentric, full stretch', cue:'Full stretch at the bottom — that range is where calves actually grow. 3-second lowering, pause at the bottom, drive up. One of five calf doses this week.', sets:{1:['215','215','215','215'],2:['215','215','215','215'],3:['215','215','215','215'],4:['215','215','215','215'],5:['215','215','215','215'],6:['215','215','215','215'],7:['215','215','215','215'],8:['215','215','215','215'],9:['215','215','215','215'],10:['185','185','185']} },
  ],
  homeLower: [
    { name:'Swiss ball leg curl', meta:'3 × 10', rec:'BW — 3s eccentric', cue:'On your back, heels on the ball, hips HIGH the whole time. Curl the ball to your glutes, then lower over 3 seconds. This is your Nordic substitute at home and it protects the knee on every landing.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { inc:5, name:'DB Bulgarian split squat', meta:'8 ea', rec:'per hand — rear foot ~12in', cue:'REAR FOOT LOW — a 12-inch step or a couple of stacked books, NOT the couch or a chair. At 6ft10 a standard-height rear foot forces your back hip and knee into the position that made them ache. Front shin vertical, drive through the heel.', sets:{1:['15','20','20'],2:['15','20','20'],3:['15','20','20'],4:['15','20','20'],5:['15','20','20'],6:['15','20','20'],7:['15','20','20'],8:['15','20','20'],9:['15','20','20'],10:['15','15','15']} },
    { ss:'A', name:'Single-leg calf raise', meta:'20 ea leg', rec:'BW — 3s up, 3s down', cue:'Superset with the Spanish squat. Toes on a step or thick book for full range. Slow both directions, full stretch at the bottom.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { ss:'A', name:'Spanish squat hold', meta:'2 × 45s', rec:'BW — tendon loading', cue:'Band around a door handle, sit back, shins vertical. Three minutes total. The cumulative effect on your warmup knee pain over 10 weeks is the whole point.', sets:{1:['45s','45s'],2:['45s','45s'],3:['45s','45s'],4:['45s','45s'],5:['45s','45s'],6:['45s','45s'],7:['45s','45s'],8:['45s','45s'],9:['45s','45s'],10:['45s','45s']} },
    { ss:'B', name:'Ab roller', meta:'3 × 8', rec:'slow and controlled', cue:'Superset with dead bugs. From your knees, roll out until your hips want to drop, then pull back with your abs — not your arms. Anterior core protects your back under heavy RDLs.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { ss:'B', name:'Dead bug', meta:'6 ea side', rec:'low back stays DOWN', cue:'Opposite arm and leg extend together. Your lower back must stay pressed to the floor the entire time — if it lifts, stop the set. Best lumbar stability drill for heavy lifters.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { inc:1, name:'Band external rotation', meta:'15 ea', rec:'1-2 lb ankle weight or band', cue:'Elbow pinned to your side, slow both directions. One of four cuff doses this week — the frequency away from the gym is what actually rebuilds shoulder tissue capacity.', sets:{1:['1','1','2'],2:['1','1','2'],3:['1','1','2'],4:['1','1','2'],5:['1','1','2'],6:['1','1','2'],7:['1','1','2'],8:['1','1','2'],9:['1','1','2'],10:['1','1']} },
  ],
  pushPull: [
    { rest:120, name:'Single-arm DB clean and jerk', meta:'4 ea side', rec:'explosive — FIRST today', cue:'This goes first while your nervous system is fresh. Clean: hips drive, catch at the shoulder. Jerk: dip, drive, lock overhead. Moderate load, every rep fast — it trains explosive hip extension and overhead shoulder stability at once.', sets:{1:['35','40','40'],2:['35','40','40'],3:['35','40','40'],4:['35','40','40'],5:['35','40','40'],6:['35','40','40'],7:['35','40','40'],8:['35','40','40'],9:['35','40','40'],10:['30','35']} },
    { name:'Scapular pull-up', meta:'2 × 10', rec:'BW — every week', cue:'Dead hang, then ONLY depress and retract the shoulder blades. No elbow bend. This is the lat engagement long-armed lifters skip, and it primes every pull that follows.', sets:{1:['BW','BW'],2:['BW','BW'],3:['BW','BW'],4:['BW','BW'],5:['BW','BW'],6:['BW','BW'],7:['BW','BW'],8:['BW','BW'],9:['BW','BW'],10:['BW','BW']} },
    { rest:150, name:'Weighted pull-up', meta:'per protocol', rec:'see cue — protocol by week', cue:'PROTOCOL — W1-4: bodyweight, 3 sets to 1 rep shy of failure. W3-4 adds banded negatives below. W5-6: +10 lbs x 5, four sets. W7-8: +20 lbs x 5. W9: test your new ceiling. Fresh today — this comes before all the rowing, not after.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['+10','+10','+10','+10'],6:['+10','+10','+10','+10'],7:['+20','+20','+20','+20'],8:['+20','+20','+20','+20'],9:['+25','+25','+25','+25'],10:['BW','BW']} },
    { name:'Banded negative pull-up', meta:'3 × 5', rec:'W3-4 only — 4s down', cue:'Jump or step to the top, then lower over 4 full seconds. Eccentric overload builds pulling strength faster than concentric reps and gets you past the 30 lb wall.', sets:{3:['BW','BW','BW'],4:['BW','BW','BW']} },
    { inc:5, ss:'A', name:'Chest-supported DB row', meta:'4 × 12', rec:'per hand — pairs with incline bench', cue:'Superset with your incline bench sets above: bench, then row, minimal rest. Chest stays on the pad so there is no lower-back compensation — pure lat and rear delt. Full stretch at the bottom.', sets:{1:['55','60','60','65'],2:['55','60','60','65'],3:['55','60','60','65'],4:['55','60','60','65'],5:['55','60','60','65'],6:['55','60','60','65'],7:['55','60','60','65'],8:['55','60','60','65'],9:['55','60','60','65'],10:['50','55','55']} },
    { inc:5, ss:'B', name:'Dips', meta:'3 × 10', rec:'banded assist — lightest band, work toward BW', cue:'Superset with lat pulldown. Slight forward lean to bias the chest, lower until upper arm is parallel. Lightest band for now to get clean full-range reps — as the band gets less supportive it comes off instead of adding weight. This is your best builder for the mid-chest and sternum area you flagged.', sets:{1:['band','band','band'],2:['band','band','band'],3:['band','band','band'],4:['band','band','band'],5:['band','band','band'],6:['band','band','band'],7:['band','band','band'],8:['band','band','band'],9:['band','band','band'],10:['band','band','band']} },
    { inc:5, ss:'B', name:'Lat pulldown', meta:'3 × 12', rec:'lat width — full stretch', cue:'Superset with dips. Let the bar pull your arms FULLY overhead between reps — the stretch at the top is where lat width comes from. Pull to the upper chest, squeeze hard.', sets:{1:['100','110','120'],2:['100','110','120'],3:['100','110','120'],4:['100','110','120'],5:['100','110','120'],6:['100','110','120'],7:['100','110','120'],8:['100','110','120'],9:['100','110','120'],10:['90','100','110']} },
    { ss:'C', name:'Facepull', meta:'3 × 15', rec:'green band, 2s pause', cue:'Superset with band external rotation. Pull to your forehead, elbows HIGH, 2-second pause at the end range. This covers your rear delts and cuff in one movement.', sets:{1:['grn','grn','grn'],2:['grn','grn','grn'],3:['grn','grn','grn'],4:['grn','grn','grn'],5:['grn','grn','grn'],6:['grn','grn','grn'],7:['grn','grn','grn'],8:['grn','grn','grn'],9:['grn','grn','grn'],10:['grn','grn']} },
    { ss:'C', name:'Band external rotation', meta:'3 × 15', rec:'light band', cue:'Straight into these after facepulls. Elbow pinned, slow and controlled. Cuff dose number two of the week.', sets:{1:['lgt','lgt','lgt'],2:['lgt','lgt','lgt'],3:['lgt','lgt','lgt'],4:['lgt','lgt','lgt'],5:['lgt','lgt','lgt'],6:['lgt','lgt','lgt'],7:['lgt','lgt','lgt'],8:['lgt','lgt','lgt'],9:['lgt','lgt','lgt'],10:['lgt','lgt']} },
    { inc:2, ss:'D', name:'DB lateral raise', meta:'3 × 15', rec:'per hand — shoulder width', cue:'Superset with calf raises — no rest needed between them. Lead with the elbow, stop at shoulder height. Second side-delt dose of the week; this is the primary driver of shoulder width.', sets:{1:['15','15','15'],2:['15','15','15'],3:['15','15','15'],4:['15','15','15'],5:['15','15','15'],6:['15','15','15'],7:['15','15','15'],8:['15','15','15'],9:['15','15','15'],10:['15','15','15']} },
    { inc:10, ss:'D', name:'Standing calf raise', meta:'3 × 12', rec:'3s eccentric', cue:'Straight after laterals. Full stretch at the bottom, same progression as Monday.', sets:{1:['215','215','215'],2:['215','215','215'],3:['215','215','215'],4:['215','215','215'],5:['215','215','215'],6:['215','215','215'],7:['215','215','215'],8:['215','215','215'],9:['215','215','215'],10:['185','185']} },
  ],
  homeUpper: [
    { name:'Pull-up practice (doorframe bar)', meta:'3 sets @ half max', rec:'NEVER to failure', cue:'If your max is 8, do sets of 4. Stop with plenty left every set. Frequency — not load — is what breaks a pull-up plateau, and at your arm length the practice matters more than usual. This is the main reason the bar was worth buying.', sets:{1:['BW','BW','BW'],2:['BW','BW','BW'],3:['BW','BW','BW'],4:['BW','BW','BW'],5:['BW','BW','BW'],6:['BW','BW','BW'],7:['BW','BW','BW'],8:['BW','BW','BW'],9:['BW','BW','BW'],10:['BW','BW']} },
    { inc:2, name:'Swiss ball incline DB press', meta:'3 × 12', rec:'per hand — 45 degree angle', cue:'Sit on the ball, walk your feet out until your upper back rests on it at about 45 degrees. Targets the upper chest and clavicle area directly. Floor press is the fallback if the ball feels unstable.', sets:{1:['20','20','20'],2:['20','20','20'],3:['20','20','20'],4:['20','20','20'],5:['20','20','20'],6:['20','20','20'],7:['20','20','20'],8:['20','20','20'],9:['20','20','20'],10:['15','15','15']} },
    { inc:2, ss:'A', name:'DB fly (floor)', meta:'3 × 15', rec:'per hand — chest stretch', cue:'Superset with lateral raises. Slight elbow bend, lower until you feel a deep chest stretch — the floor conveniently stops you before the shoulder gets stressed.', sets:{1:['15','15','15'],2:['15','15','15'],3:['15','15','15'],4:['15','15','15'],5:['15','15','15'],6:['15','15','15'],7:['15','15','15'],8:['15','15','15'],9:['15','15','15'],10:['12','12','12']} },
    { inc:2, ss:'A', name:'DB lateral raise', meta:'3 × 15', rec:'per hand — second dose', cue:'Straight after flies. Lead with the elbow, stop at shoulder height, control the lowering.', sets:{1:['15','15','15'],2:['15','15','15'],3:['15','15','15'],4:['15','15','15'],5:['15','15','15'],6:['15','15','15'],7:['15','15','15'],8:['15','15','15'],9:['15','15','15'],10:['12','12']} },
    { inc:2, ss:'B', name:'DB curl (incline on ball)', meta:'3 × 12', rec:'per hand — bicep length', cue:'Superset with overhead triceps. Lean back on the ball so your arms hang behind your torso — that stretch builds the long head and the peak. 3s lowering, turn the palm fully up at the top.', sets:{1:['20','20','20'],2:['20','20','20'],3:['20','20','20'],4:['20','20','20'],5:['20','20','20'],6:['20','20','20'],7:['20','20','20'],8:['20','20','20'],9:['20','20','20'],10:['15','15','15']} },
    { inc:2, ss:'B', name:'Overhead DB triceps extension', meta:'3 × 12', rec:'one DB, both hands', cue:'NEW — and the biggest gap in your old program. Triceps are about two thirds of your arm mass. Overhead puts the long head on stretch, which is the version that actually adds size. Elbows point forward, lower slowly behind your head.', sets:{1:['25','25','25'],2:['25','25','25'],3:['25','25','25'],4:['25','25','25'],5:['25','25','25'],6:['25','25','25'],7:['25','25','25'],8:['25','25','25'],9:['25','25','25'],10:['20','20','20']} },
    { inc:2, ss:'C', name:'Hammer curl', meta:'3 × 12', rec:'per hand — arm thickness', cue:'Superset with reverse curls. Neutral grip, strict — no swinging. Builds the brachialis underneath the bicep, which pushes it up and makes the arm look bigger from every angle.', sets:{1:['20','20','20'],2:['20','20','20'],3:['20','20','20'],4:['20','20','20'],5:['20','20','20'],6:['20','20','20'],7:['20','20','20'],8:['20','20','20'],9:['20','20','20'],10:['15','15','15']} },
    { inc:2, ss:'C', name:'Reverse curl', meta:'2 × 15', rec:'per hand — forearm mass', cue:'Straight after hammers. Overhand grip, go light — this is much harder than it looks. Forearm development shows on long arms more than on anyone else.', sets:{1:['12','12'],2:['12','12'],3:['12','12'],4:['12','12'],5:['12','12'],6:['12','12'],7:['12','12'],8:['12','12'],9:['12','12'],10:['10','10']} },
    { name:'Band pull-apart', meta:'2 × 20', rec:'light-medium band', cue:'Arms straight, squeeze the shoulder blades. Low fatigue, compounds over weeks. Fine to do these in front of the TV.', sets:{1:['lgt','lgt'],2:['lgt','lgt'],3:['lgt','lgt'],4:['lgt','lgt'],5:['lgt','lgt'],6:['lgt','lgt'],7:['lgt','lgt'],8:['lgt','lgt'],9:['lgt','lgt'],10:['lgt','lgt']} },
    { name:'Dead hang', meta:'2 × 40s', rec:'grip + decompression', cue:'Steel doorframe bar, fully relaxed hang. Directly attacks the grip limitation behind your pull-up ceiling. Once a week, try one set hanging from a towel over the bar.', sets:{1:['40s','40s'],2:['40s','40s'],3:['40s','40s'],4:['40s','40s'],5:['40s','40s'],6:['40s','40s'],7:['40s','40s'],8:['40s','40s'],9:['40s','40s'],10:['30s','30s']} },
  ],
  powerPre: [
    { rest:150, name:'Hang clean', meta:'4 × 3', rec:'SPEED decides the load', cue:'FIRST real lift of the day, while you are fresh. Bar at the hang just above the knee. Hips drive, shrug, high pull, catch high in the power position — no deep squat receive needed. Controlled eccentric back to the hang, no dropping. If the bar slows at your hip, strip 10 lbs. Full 2.5 min rest — this is neural work, not conditioning.', sets:{1:['115','115','115','115'],2:['115','115','115','115'],3:['125','125','125','125'],4:['125','125','125','125'],5:['135','135','135','135'],6:['135','135','135','135'],7:['145','145','145','145'],8:['145','145','145','145'],9:['145','145','145','145'],10:['115','115','115']} },
    { inc:5, rest:120, name:'Front squat', meta:'3 × 5', rec:'rack position + quads', cue:'Straight after cleans while the rack position is already grooved — this was your idea and it is the right one. Elbows HIGH, bar on the front delts not the hands, wrists loose. Upright torso means quad work that spares your knee.', sets:{1:['105','115','115'],2:['105','115','115'],3:['105','115','115'],4:['105','115','115'],5:['105','115','115'],6:['105','115','115'],7:['105','115','115'],8:['105','115','115'],9:['105','115','115'],10:['95','105','105']} },
  ],
  power: [
    { inc:10, ss:'A', name:'Barbell hip thrust', meta:'3 × 10', rec:'glutes, no spinal load', cue:'Superset with landmine rotations. Replaces Good Mornings this block — Friday already has three spine-loading lifts and a fourth is exactly where your form broke down before. Drive through the heels, 1s squeeze at the top.', sets:{1:['225','245','245'],2:['235', '255', '305'],3:['245', '275', '315'],4:['255', '285', '325'],5:['255', '285', '325'],6:['265', '295', '335'],7:['265', '295', '335'],8:['275', '305', '340'],9:['275', '305', '340'],10:['225', '245', '265']} },
    { ss:'A', name:'Landmine rotation', meta:'5 ea side', rec:'plate on the sleeve', cue:'Bar in a corner (towel to protect the wall), light plate on the sleeve. Hips BEFORE shoulders — the power comes from trunk rotation. No slamming, no wall needed, gym-legal.', sets:{1:['10','10','10'],2:['10','10','10'],3:['10','10','10'],4:['10','10','10'],5:['10','10','10'],6:['10','10','10'],7:['10','10','10'],8:['10','10','10'],9:['10','10','10'],10:['10','10']} },
    { inc:5, name:'Seated calf raise', meta:'3 × 15', rec:'plates on lap', cue:'Last calf dose of the week. Full range, 1s pause at the bottom. Frequency across five sessions is what grows calves — this one does not need to be heroic.', sets:{1:['180','180','180'],2:['180','180','180'],3:['180','180','180'],4:['180','180','180'],5:['180','180','180'],6:['180','180','180'],7:['180','180','180'],8:['180','180','180'],9:['180','180','180'],10:['155','155']} },
  ],
  prehab: [
    { name:'Band external rotation', meta:'15 ea', rec:'light band', cue:'Elbow pinned, slow both ways. Saturday maintenance dose, two days before Monday.', sets:{1:['lgt','lgt'],2:['lgt','lgt'],3:['lgt','lgt'],4:['lgt','lgt'],5:['lgt','lgt'],6:['lgt','lgt'],7:['lgt','lgt'],8:['lgt','lgt'],9:['lgt','lgt'],10:['lgt','lgt']} },
    { name:'Band pull-apart', meta:'20 reps', rec:'light band', cue:'Arms straight, squeeze the blades. Keeps the rear delts and scapula honest.', sets:{1:['lgt','lgt'],2:['lgt','lgt'],3:['lgt','lgt'],4:['lgt','lgt'],5:['lgt','lgt'],6:['lgt','lgt'],7:['lgt','lgt'],8:['lgt','lgt'],9:['lgt','lgt'],10:['lgt','lgt']} },
    { name:'Dead hang', meta:'30s', rec:'decompression', cue:'Relaxed hang on the home bar — decompresses the spine and shoulders going into Monday.', sets:{1:['30s','30s'],2:['30s','30s'],3:['30s','30s'],4:['30s','30s'],5:['30s','30s'],6:['30s','30s'],7:['30s','30s'],8:['30s','30s'],9:['30s','30s'],10:['30s','30s']} },
    { name:'Single-leg calf raise', meta:'15 ea', rec:'full range', cue:'Fifth and final calf dose of the week. Even two easy sets compound over 10 weeks.', sets:{1:['BW','BW'],2:['BW','BW'],3:['BW','BW'],4:['BW','BW'],5:['BW','BW'],6:['BW','BW'],7:['BW','BW'],8:['BW','BW'],9:['BW','BW'],10:['BW','BW']} },
    { name:'Hip 90/90 switches', meta:'8 ea side', rec:'BW — hip mobility', cue:'Rotate slowly between internal and external hip positions. Hip mobility feeds landing mechanics and knee health.', sets:{1:['BW','BW'],2:['BW','BW'],3:['BW','BW'],4:['BW','BW'],5:['BW','BW'],6:['BW','BW'],7:['BW','BW'],8:['BW','BW'],9:['BW','BW'],10:['BW','BW']} },
  ],
};

const PB = {
  monEarly: [
    { name:'Box jump (step down)', vol:'4 × 4', rec:'BW', cue:'Max height intent, step down — protect ankles at 240 lbs', sets:['BW','BW','BW','BW'] },
    { name:'Broad jump → stick', vol:'3 × 5', rec:'BW', cue:'Horizontal power, stick 2s — sand court landing mechanics', sets:['BW','BW','BW'] },
    { name:'Ankle pogo (continuous)', vol:'3 × 15', rec:'BW', cue:'Minimal knee bend, fast ground contact — reactive ankle stiffness', sets:['BW','BW','BW'] },
  ],
  monLate: [
    { name:'Depth drop → box jump', vol:'4 × 4', rec:'BW', cue:'Drop, instant reaction — minimize ground contact time', sets:['BW','BW','BW','BW'] },
    { name:'Single-leg bound → stick', vol:'3 × 5 ea', rec:'BW', cue:'Drive knee up, stick 2s — mimics VB approach takeoff', sets:['BW','BW','BW'] },
    { name:'Trap bar jump', vol:'4 × 4', rec:'155 lbs', cue:'Hinge back, explode through hips — transfers DL strength to power', sets:['155','155','155','155'] },
    { name:'Ankle pogo (fast)', vol:'3 × 20', rec:'BW', cue:'Minimal knee bend, fast ground contact — reactive ankle stiffness', sets:['BW','BW','BW'] },
  ],
  tueEarly: [
    { name:'Med ball overhead slam', vol:'4 × 6', rec:'10 lbs', cue:'Overhead deceleration — mirrors spike follow-through mechanics', sets:['10','10','10','10'] },
    { name:'Explosive push-up', vol:'4 × 5', rec:'BW', cue:'Tight core, max push velocity — rate of force development', sets:['BW','BW','BW','BW'] },
    { name:'Med ball rotational throw', vol:'3 × 6 ea', rec:'10 lbs', cue:'Hips before shoulders, max trunk rotation — primary hitting velocity driver', sets:['10','10','10'] },
  ],
  tueLate: [
    { name:'Med ball spike sim (kneeling)', vol:'4 × 6', rec:'10 lbs', cue:'Full wind-up, accelerate through contact — direct arm swing pattern', sets:['10','10','10','10'] },
    { name:'Band-resisted arm swing', vol:'3 × 10', rec:'light→med', cue:'Fast elbow drive, don\'t let band win — acceleration phase of spike', sets:['lgt','med','med'] },
    { name:'Med ball rotational throw', vol:'4 × 6 ea', rec:'10 lbs', cue:'Hips before shoulders, max trunk rotation — primary hitting velocity driver', sets:['10','10','10','10'] },
    { name:'Explosive push-up → plyo', vol:'3 × 5', rec:'BW', cue:'Tight core, max push velocity — upper body RFD, protect shoulder at contact', sets:['BW','BW','BW'] },
  ],
  fri: [
    { name:'VB approach jump (max effort)', vol:'4 × 5', rec:'BW — film it', cue:'Full 3-step, 2-foot plant, max arm swing — measure height each week', sets:['BW','BW','BW','BW'] },
    { name:'Single-leg vertical (non-dom)', vol:'3 × 4 ea', rec:'BW', cue:'Drive knee up hard, full hip extension — reduce bilateral deficit', sets:['BW','BW','BW'] },
    { name:'Sled push 20m', vol:'4 rounds', rec:'mod→heavy', cue:'Low hips, drive through full hip extension — posterior chain endurance', sets:['mod','mod','hvy','hvy'] },
    { name:'Assault bike 12s / 48s off', vol:'5 rounds', rec:'max effort', cue:'Max output from first stroke, full recovery between — mirrors VB point energy system', sets:['max','max','max','max','max'] },
  ],
};

const PUMP = [
  { name:'EZ bar curl', meta:'4 × 10', rec:'moderate', cue:'Full supination at top, slow eccentric — peak contraction focus', sets:['','','',''] },
  { name:'Incline DB curl', meta:'3 × 12', rec:'light-mod', cue:'Full stretch at bottom — long head emphasis, great for arm size', sets:['','',''] },
  { name:'Hammer curl', meta:'3 × 12', rec:'moderate', cue:'Neutral grip, controlled — brachialis and forearm thickness', sets:['','',''] },
  { name:'Tricep pushdown (rope)', meta:'4 × 12', rec:'moderate', cue:'Elbows pinned, flare at bottom — lateral head pump', sets:['','','',''] },
  { name:'Overhead tricep extension', meta:'3 × 12', rec:'light-mod', cue:'Full stretch overhead — long head, biggest part of the tricep', sets:['','',''] },
  { name:'DB lateral raise', meta:'3 × 15', rec:'light', cue:'Light weight, high reps — shoulder cap pump, keep it easy', sets:['','',''] },
  { name:'Cable curl (single arm)', meta:'3 × 12 ea', rec:'light-mod', cue:'Constant tension throughout — finish with a hard squeeze at top', sets:['','',''] },
];
