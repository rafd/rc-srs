import { FSRS, Rating, generatorParameters, createEmptyCard } from '/scripts/ts-fsrs/index.mjs';

const fsrs = new FSRS(generatorParameters());
let allProfiles = [];
let cardStates = JSON.parse(localStorage.getItem('rc-memory-game-cards') || '{}');
let currentCardInfo = null;
let hasErroredOnCurrent = false;
let streakCount = 0;

const STREAK_NAMES = {
  1: 'FIRST FRIEND!',
  2: 'DOUBLE FRIEND!',
  3: 'MULTI FRIEND!',
  4: 'MEGA FRIEND!',
  5: 'ULTRA FRIEND!',
  6: 'M-M-M-MONSTER FRIEND!',
  7: 'LUDICROUS FRIEND!',
  8: 'HOLY FRIEND!',
  10: 'FRIEND SPREE!',
  15: 'DOMINATING FRIEND!',
  20: 'UNSTOPPABLE FRIEND!',
  25: 'GODLIKE FRIEND!',
  30: 'WICKED SICK FRIEND!',
};

function showAnnouncement(text) {
  const overlay = document.getElementById('announcement-overlay');
  const el = document.createElement('div');
  el.className = 'announcement';
  el.textContent = text;
  overlay.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
  }, 1500);
}

function updateStreakDisplay() {
  const streakDisplay = document.getElementById('streak-display');
  streakDisplay.textContent = streakCount > 0 ? `Streak: ${streakCount}` : '';
}

function saveStates() {
  localStorage.setItem('rc-memory-game-cards', JSON.stringify(cardStates));
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
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Filter profiles that have both name and image
    allProfiles = data.filter((p) => p.name && p.image_path);

    if (allProfiles.length >= 4) {
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
  currentCardInfo = selected;
  hasErroredOnCurrent = false;

  // Find distractors with same pronouns
  let potentialDistractors = allProfiles.filter(
    (p) => p.id !== correctPerson.id && p.pronouns === correctPerson.pronouns,
  );

  if (potentialDistractors.length < 3) {
    const others = allProfiles.filter(
      (p) => p.id !== correctPerson.id && p.pronouns !== correctPerson.pronouns,
    );
    const shuffledOthers = others.sort(() => 0.5 - Math.random());
    potentialDistractors = potentialDistractors.concat(
      shuffledOthers.slice(0, 3 - potentialDistractors.length),
    );
  }

  const distractors = potentialDistractors.sort(() => 0.5 - Math.random()).slice(0, 3);

  const options = [correctPerson, ...distractors].sort(() => 0.5 - Math.random());

  renderChallenge(challengeType, correctPerson, options);
}

function renderChallenge(type, correct, options) {
  const container = document.getElementById('game-content');
  container.innerHTML = '';

  const targetDiv = document.createElement('div');
  targetDiv.className = 'challenge-target';

  if (type === 'face-to-name') {
    targetDiv.innerHTML = `<img src="${correct.image_path}" alt="Who is this?">`;
  } else {
    targetDiv.innerHTML = `<div class="target-name">Who is ${correct.name}?</div>`;
  }
  container.appendChild(targetDiv);

  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'options-grid';

  options.forEach((option) => {
    if (type === 'face-to-name') {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = option.name;
      btn.dataset.profileId = option.id;
      btn.onclick = () => handleChoice(btn, option.id === correct.id);
      optionsGrid.appendChild(btn);
    } else {
      const img = document.createElement('img');
      img.src = option.image_path;
      img.className = 'image-option';
      img.dataset.profileId = option.id;
      img.onclick = () => handleChoice(img, option.id === correct.id);
      optionsGrid.appendChild(img);
    }
  });

  container.appendChild(optionsGrid);
}

function handleChoice(element, isCorrect) {
  const now = new Date();
  const targetKey = `${currentCardInfo.profile.id}:${currentCardInfo.type}`;
  const targetCard = getCard(currentCardInfo.profile.id, currentCardInfo.type);

  if (isCorrect) {
    element.classList.add('correct');

    // If they got it right on the first try, mark as Good.
    // If they already failed, we've already recorded the failure(s).
    if (!hasErroredOnCurrent) {
      const schedulingCards = fsrs.repeat(targetCard, now);
      cardStates[targetKey] = schedulingCards[Rating.Good].card;
      saveStates();

      streakCount++;
      updateStreakDisplay();
      if (STREAK_NAMES[streakCount]) {
        showAnnouncement(STREAK_NAMES[streakCount]);
      } else if (streakCount > 30 && streakCount % 5 === 0) {
        showAnnouncement(STREAK_NAMES[30]);
      }
    }

    // Disable all options
    const allOptions = element.parentElement.children;
    for (let opt of allOptions) {
      opt.onclick = null;
      if (opt !== element) {
        opt.style.opacity = '0.5';
        opt.style.pointerEvents = 'none';
      }
    }

    setTimeout(startNewChallenge, 1000);
  } else {
    element.classList.add('incorrect');
    element.onclick = null;
    element.style.pointerEvents = 'none';
    streakCount = 0;
    updateStreakDisplay();

    // Record failure for the TARGET card
    const targetScheduling = fsrs.repeat(targetCard, now);
    cardStates[targetKey] = targetScheduling[Rating.Again].card;

    // Record failure for the DISTRACTOR card for BOTH directions
    const distractorId = element.dataset.profileId;
    ['face-to-name', 'name-to-face'].forEach((dir) => {
      const distractorKey = `${distractorId}:${dir}`;
      const distractorCard = getCard(distractorId, dir);
      const distractorScheduling = fsrs.repeat(distractorCard, now);
      cardStates[distractorKey] = distractorScheduling[Rating.Again].card;
    });

    saveStates();
    hasErroredOnCurrent = true;
  }
}

// Initialize the game on load
initGame();
