import { FSRS, Rating, generatorParameters, createEmptyCard } from 'https://esm.sh/ts-fsrs@5.2.3';

const fsrs = new FSRS(generatorParameters());
let allProfiles = [];
let cardStates = JSON.parse(localStorage.getItem('rc-memory-game-cards') || '{}');
let confusionMatrix = JSON.parse(localStorage.getItem('rc-memory-game-confusion') || '{}');
let currentCardInfo = null;
let hasErroredOnCurrent = false;
let streakCount = parseInt(localStorage.getItem('rc-memory-game-streak') || '0', 10);

const STREAK_NAMES = {
  10:  { name: 'MATCHING SPREE',  color: '#28a745' }, // green
  25:  { name: 'WICKED',          color: '#20c997' }, // teal
  50:  { name: 'OCT-TASTIC',      color: '#4dabf7' }, // blue
  75:  { name: 'R-R-R-RECURSIVE', color: '#ae3ec9' }, // purple
  100: { name: 'GODLIKE',         color: '#ffd700' }, // gold
};

function showAnnouncement(text, color) {
  const overlay = document.getElementById('announcement-overlay');
  const el = document.createElement('div');
  el.className = 'announcement';
  el.textContent = text;
  if (color) {
    el.style.color = color;
    el.style.textShadow = `2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000, 1px 1px 0px #000, 0 0 10px ${color}80`;
  }
  overlay.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 1500);
}

function updateStreakDisplay() {
  const container = document.getElementById('streak-container');
  const progressBg = document.getElementById('streak-progress-bg');
  const progressFill = document.getElementById('streak-progress-fill');

  if (streakCount > 0) {
    progressBg.style.display = 'block';

    // Progress bar fills between consecutive STREAK_NAMES milestones
    const milestones = [0, ...Object.keys(STREAK_NAMES).map(Number).sort((a, b) => a - b)];
    const maxMilestone = milestones[milestones.length - 1];
    const cyclicStreak = ((streakCount - 1) % maxMilestone) + 1;
    const prevMilestone = [...milestones].reverse().find((m) => m < cyclicStreak) ?? 0;
    const nextMilestone = milestones.find((m) => m >= cyclicStreak) ?? maxMilestone;
    const progress = ((cyclicStreak - prevMilestone) / (nextMilestone - prevMilestone)) * 100;
    progressFill.style.width = `${progress}%`;
    progressFill.style.background = STREAK_NAMES[nextMilestone].color;
    progressBg.style.background = STREAK_NAMES[prevMilestone]?.color ?? '#ddd';

    // Shake intensity: Increases every 5 points
    const intensity = Math.min(Math.floor(streakCount / 5), 5);
    if (intensity > 0) {
      container.classList.add('shaking');
      container.style.setProperty('--shake-intensity', `${intensity}px`);
    } else {
      container.classList.remove('shaking');
    }
  } else {
    progressBg.style.display = 'none';
    container.classList.remove('shaking');
  }
}

function saveStates() {
  localStorage.setItem('rc-memory-game-cards', JSON.stringify(cardStates));
  localStorage.setItem('rc-memory-game-confusion', JSON.stringify(confusionMatrix));
  localStorage.setItem('rc-memory-game-streak', String(streakCount));
}

// In FSRS, difficulty ranges from 1 (easiest) to 10 (hardest).
// New or hard cards get fewer candidates; well-known cards get more.
function getNumCandidates(card, maxAvailable) {
  const d = card.difficulty;
  let requested;
  if (card.state === 0 || d >= 7) requested = 2;
  else if (d >= 5) requested = 4;
  else requested = 6;

  return Math.min(requested, maxAvailable);
}

function getCard(profileId, type) {
  const key = `${profileId}:${type}`;
  if (!cardStates[key]) {
    cardStates[key] = createEmptyCard();
  }
  // Ensure dates are actual Date objects after JSON.parse
  const card = cardStates[key];
  card.due = new Date(card.due);
  card.last_review = card.last_review ? new Date(card.last_review) : undefined;
  return card;
}

async function initGame() {
  const container = document.getElementById('game-content');
  const proxyUrl = '/api/directory';

  try {
    const response = await fetch(proxyUrl);
    if (response.status === 401) {
      container.innerHTML = '<h1>Learn You Some Face</h1><a href="/auth/login">Log In</a>';
      return;
    }
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Filter profiles that have both first_name and image
    allProfiles = data.filter((p) => p.first_name && p.image_path);

    if (allProfiles.length >= 2) {
      startNewChallenge();
    } else {
      container.innerHTML = '<p>Not enough profiles to start a game.</p>';
    }
  } catch (error) {
    console.error('Fetch error:', error);
    container.innerHTML = `<p>Error loading data: ${error.message}</p>`;
  }
}

function startNewChallenge() {
  // Try to load an existing active challenge first
  const savedActive = localStorage.getItem('rc-memory-game-active-challenge');
  if (savedActive) {
    try {
      const active = JSON.parse(savedActive);
      const correctPerson = allProfiles.find((p) => p.id === active.correctId);
      const options = active.optionIds
        .map((id) => allProfiles.find((p) => p.id === id))
        .filter(Boolean);

      // Verify we still have all necessary data
      if (correctPerson && options.length === active.optionIds.length) {
        currentCardInfo = { profile: correctPerson, type: active.type };
        hasErroredOnCurrent = active.hasErrored || false;
        renderChallenge(active.type, correctPerson, options);
        return;
      }
    } catch (e) {
      console.error('Error restoring active challenge:', e);
    }
  }

  const now = new Date();

  // 1. Identify all possible cards (2 per profile)
  const allPossibleCards = [];
  allProfiles.forEach((p) => {
    allPossibleCards.push({ profile: p, type: 'face-to-name' });
    allPossibleCards.push({ profile: p, type: 'name-to-face' });
  });

  // 2. Find due cards or new cards
  const dueCards = allPossibleCards.filter((c) => {
    const card = getCard(c.profile.id, c.type);
    return card.due <= now && card.state !== 0; // State 0 is New
  });

  const newCards = allPossibleCards.filter((c) => {
    const card = getCard(c.profile.id, c.type);
    return card.state === 0;
  });

  let selected;
  if (dueCards.length > 0) {
    // Pick the most overdue card
    selected = dueCards.sort((a, b) => {
      const cardA = getCard(a.profile.id, a.type);
      const cardB = getCard(b.profile.id, b.type);
      return cardA.due - cardB.due;
    })[0];
  } else if (newCards.length > 0) {
    // Pick a random new card
    selected = newCards[Math.floor(Math.random() * newCards.length)];
  } else {
    // Everything is reviewed and not yet due, pick the one due soonest
    selected = allPossibleCards.sort((a, b) => {
      const cardA = getCard(a.profile.id, a.type);
      const cardB = getCard(b.profile.id, b.type);
      return cardA.due - cardB.due;
    })[0];
  }

  const { profile: correctPerson, type: challengeType } = selected;
  const targetCard = getCard(correctPerson.id, challengeType);
  currentCardInfo = selected;
  hasErroredOnCurrent = false;

  const numCandidates = getNumCandidates(targetCard, allProfiles.length);
  const numDistractors = numCandidates - 1;

  // Find distractors with unique first names
  const shuffledProfiles = [...allProfiles].sort(() => 0.5 - Math.random());
  const distractors = [];
  const usedFirstNames = new Set([correctPerson.first_name]);

  // Priority 0: Known Confusions (profiles previously mistaken for the target)
  const personConfusion = confusionMatrix[correctPerson.id] || {};
  const confusionProfiles = Object.entries(personConfusion)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => allProfiles.find((p) => String(p.id) === id))
    .filter(Boolean);

  for (const p of confusionProfiles) {
    if (distractors.length >= numDistractors) break;
    if (p.id === correctPerson.id) continue;
    if (!usedFirstNames.has(p.first_name)) {
      distractors.push(p);
      usedFirstNames.add(p.first_name);
    }
  }

  // Priority 1: Same pronouns + Unique First Name
  for (const p of shuffledProfiles) {
    if (distractors.length >= numDistractors) break;
    if (p.id === correctPerson.id || distractors.some((d) => d.id === p.id)) continue;
    if (p.pronouns === correctPerson.pronouns && !usedFirstNames.has(p.first_name)) {
      distractors.push(p);
      usedFirstNames.add(p.first_name);
    }
  }

  // Priority 2: Fill remaining with any profile + Unique First Name
  for (const p of shuffledProfiles) {
    if (distractors.length >= numDistractors) break;
    if (p.id === correctPerson.id || distractors.some((d) => d.id === p.id)) continue;
    if (!usedFirstNames.has(p.first_name)) {
      distractors.push(p);
      usedFirstNames.add(p.first_name);
    }
  }

  const options = [correctPerson, ...distractors].sort(() => 0.5 - Math.random());

  // Save the new challenge to localStorage
  localStorage.setItem(
    'rc-memory-game-active-challenge',
    JSON.stringify({
      correctId: correctPerson.id,
      type: challengeType,
      optionIds: options.map((o) => o.id),
      hasErrored: false,
    }),
  );

  renderChallenge(challengeType, correctPerson, options);
}

function renderChallenge(type, correct, options) {
  const container = document.getElementById('game-content');
  container.innerHTML = '';

  const targetDiv = document.createElement('div');
  targetDiv.className = 'challenge-target';

  if (type === 'face-to-name') {
    targetDiv.innerHTML = `<img src="${correct.image_path}">`;
  } else {
    targetDiv.innerHTML = `<div class="target-name">${correct.first_name}</div>`;
  }
  container.appendChild(targetDiv);

  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'options-grid';

  options.forEach((option, index) => {
    const label = index + 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'option-wrapper';

    if (type === 'face-to-name') {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-key">${label}</span> ${option.first_name}`;
      btn.dataset.profileId = option.id;
      btn.onclick = () => handleChoice(btn, option.id === correct.id);
      wrapper.appendChild(btn);
    } else {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'image-option-wrapper';
      imgWrapper.onclick = () => handleChoice(imgWrapper, option.id === correct.id);
      imgWrapper.dataset.profileId = option.id;

      const img = document.createElement('img');
      img.src = option.image_path;
      img.className = 'image-option';

      const keyLabel = document.createElement('div');
      keyLabel.className = 'image-key-label';
      keyLabel.textContent = label;

      imgWrapper.appendChild(img);
      imgWrapper.appendChild(keyLabel);
      wrapper.appendChild(imgWrapper);
    }
    optionsGrid.appendChild(wrapper);
  });

  container.appendChild(optionsGrid);
}

// Add global keyboard listener
window.addEventListener('keydown', (e) => {
  const key = parseInt(e.key);
  if (key >= 1 && key <= 8) {
    const wrappers = document.querySelectorAll('.option-wrapper');
    const target = wrappers[key - 1];
    if (target) {
      const clickTarget = target.querySelector('.option-btn, .image-option-wrapper');
      if (clickTarget && clickTarget.onclick) {
        clickTarget.click();
      }
    }
  }
});

function handleChoice(element, isCorrect) {
  const now = new Date();
  const targetKey = `${currentCardInfo.profile.id}:${currentCardInfo.type}`;
  const targetCard = getCard(currentCardInfo.profile.id, currentCardInfo.type);

  if (isCorrect) {
    element.classList.add('correct');
    localStorage.removeItem('rc-memory-game-active-challenge');

    // If they got it right on the first try, mark as Good.
    // If they already failed, we've already recorded the failure(s).
    if (!hasErroredOnCurrent) {
      const schedulingCards = fsrs.repeat(targetCard, now);
      cardStates[targetKey] = schedulingCards[Rating.Good].card;
      saveStates();

      streakCount++;
      updateStreakDisplay();
      if (STREAK_NAMES[streakCount]) {
        showAnnouncement(STREAK_NAMES[streakCount].name, STREAK_NAMES[streakCount].color);
      } else if (streakCount > 100 && streakCount % 5 === 0) {
        showAnnouncement(STREAK_NAMES[100].name, STREAK_NAMES[100].color);
      }
    }

    // Disable all options
    const allWrappers = document.querySelectorAll('.option-wrapper');
    allWrappers.forEach((wrap) => {
      const opt = wrap.querySelector('.option-btn, .image-option-wrapper');
      if (opt) {
        opt.onclick = null;
        if (opt !== element) {
          opt.style.opacity = '0.5';
          opt.style.pointerEvents = 'none';
        }
      }
    });

    setTimeout(startNewChallenge, 400);
  } else {
    element.classList.add('incorrect');
    element.onclick = null;
    element.style.pointerEvents = 'none';
    streakCount = 0;
    updateStreakDisplay();

    const targetId = currentCardInfo.profile.id;
    const distractorId = element.dataset.profileId;

    // Record in confusionMatrix for both directions
    if (!confusionMatrix[targetId]) confusionMatrix[targetId] = {};
    confusionMatrix[targetId][distractorId] = (confusionMatrix[targetId][distractorId] || 0) + 1;
    if (!confusionMatrix[distractorId]) confusionMatrix[distractorId] = {};
    confusionMatrix[distractorId][targetId] = (confusionMatrix[distractorId][targetId] || 0) + 1;

    // Record failure for the TARGET card
    const targetScheduling = fsrs.repeat(targetCard, now);
    cardStates[targetKey] = targetScheduling[Rating.Again].card;

    // Record failure for the DISTRACTOR card for BOTH directions
    ['face-to-name', 'name-to-face'].forEach((dir) => {
      const distractorKey = `${distractorId}:${dir}`;
      const distractorCard = getCard(distractorId, dir);
      const distractorScheduling = fsrs.repeat(distractorCard, now);
      cardStates[distractorKey] = distractorScheduling[Rating.Again].card;
    });

    saveStates();
    hasErroredOnCurrent = true;

    // Update active challenge in localStorage to persist the error state
    const savedActive = localStorage.getItem('rc-memory-game-active-challenge');
    if (savedActive) {
      const active = JSON.parse(savedActive);
      active.hasErrored = true;
      localStorage.setItem('rc-memory-game-active-challenge', JSON.stringify(active));
    }
  }
}

// Initialize the game on load
updateStreakDisplay();
initGame();
